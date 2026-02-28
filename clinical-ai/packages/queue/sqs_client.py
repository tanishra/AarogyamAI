import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

# ── Message contracts ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AITaskMessage:
    """
    Message sent to SQS when nurse marks patient ready.
    AgentWorker consumes this to start synthesis.
    """
    session_id: str
    clinic_id: str
    patient_id: str
    task_type: str = "synthesis"
    message_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "clinic_id": self.clinic_id,
            "patient_id": self.patient_id,
            "task_type": self.task_type,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any], message_id: str = "") -> "AITaskMessage":
        return cls(
            session_id=data["session_id"],
            clinic_id=data["clinic_id"],
            patient_id=data["patient_id"],
            task_type=data.get("task_type", "synthesis"),
            message_id=message_id,
        )


@dataclass(frozen=True)
class SQSReceivedMessage:
    """Wrapper around a raw SQS message."""
    message_id: str
    receipt_handle: str
    body: dict[str, Any]


# ── Client ─────────────────────────────────────────────────────────────────────

class SQSClient:
    """
    Thin wrapper around boto3 SQS.
    Handles serialisation, logging, and error wrapping.
    Business logic never touches boto3 directly.
    """

    def __init__(
        self,
        queue_url: str,
        region: str = "ap-south-1",
        endpoint_url: str | None = None,  # LocalStack in dev
    ) -> None:
        self._queue_url = queue_url
        self._client = boto3.client(
            "sqs",
            region_name=region,
            endpoint_url=endpoint_url,
        )

    def send_ai_task(self, message: AITaskMessage) -> str:
        """
        Sends an AI synthesis task to SQS.
        Returns the SQS message ID.
        Raises RuntimeError on failure.
        """
        try:
            response = self._client.send_message(
                QueueUrl=self._queue_url,
                MessageBody=json.dumps(message.to_dict()),
                MessageDeduplicationId=str(uuid4()),  # FIFO dedup
                MessageGroupId=message.session_id,    # FIFO ordering per session
            )
            msg_id: str = response["MessageId"]
            logger.info(
                "SQS message sent",
                extra={
                    "sqs_message_id": msg_id,
                    "session_id": message.session_id,
                    "task_type": message.task_type,
                },
            )
            return msg_id

        except (BotoCoreError, ClientError) as exc:
            logger.error(
                "SQS send failed",
                extra={"session_id": message.session_id, "error": str(exc)},
            )
            raise RuntimeError(f"SQS send failed: {exc}") from exc

    def receive_messages(
        self,
        max_messages: int = 1,
        wait_time_seconds: int = 20,
        visibility_timeout: int = 120,
    ) -> list[SQSReceivedMessage]:
        """
        Long-poll SQS for messages.
        Returns list of SQSReceivedMessage — empty list if no messages.
        """
        try:
            response = self._client.receive_message(
                QueueUrl=self._queue_url,
                MaxNumberOfMessages=max_messages,
                WaitTimeSeconds=wait_time_seconds,
                VisibilityTimeout=visibility_timeout,
            )
            messages = response.get("Messages", [])
            return [
                SQSReceivedMessage(
                    message_id=m["MessageId"],
                    receipt_handle=m["ReceiptHandle"],
                    body=json.loads(m["Body"]),
                )
                for m in messages
            ]

        except (BotoCoreError, ClientError) as exc:
            logger.error("SQS receive failed", extra={"error": str(exc)})
            return []

    def delete_message(self, receipt_handle: str) -> None:
        """
        Delete message after successful processing.
        Call this only after AgentLoop completes successfully.
        """
        try:
            self._client.delete_message(
                QueueUrl=self._queue_url,
                ReceiptHandle=receipt_handle,
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error(
                "SQS delete failed",
                extra={"receipt_handle": receipt_handle, "error": str(exc)},
            )
            # Do not raise — message will re-appear after visibility timeout
            # AgentLoop must be idempotent


# ── Module-level singleton ─────────────────────────────────────────────────────
_sqs_client: SQSClient | None = None


def init_sqs(
    queue_url: str,
    region: str = "ap-south-1",
    endpoint_url: str | None = None,
) -> None:
    """Call once at worker startup."""
    global _sqs_client
    _sqs_client = SQSClient(
        queue_url=queue_url,
        region=region,
        endpoint_url=endpoint_url,
    )


def get_sqs() -> SQSClient:
    if _sqs_client is None:
        raise RuntimeError("SQS not initialised. Call init_sqs() first.")
    return _sqs_client