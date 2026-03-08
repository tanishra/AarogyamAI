import pytest
from agent_worker.agent.tools.output_filter import OutputFilterTool
from packages.domain.enums import OutcomeStatus


@pytest.fixture
def tool() -> OutputFilterTool:
    return OutputFilterTool()


class TestToolInterface:
    def test_name(self, tool):
        assert tool.name == "OutputFilterTool"

    @pytest.mark.asyncio
    async def test_missing_text_returns_failure(self, tool):
        result = await tool.run({"session_id": "s-001"})
        assert result.success is False

    @pytest.mark.asyncio
    async def test_non_string_returns_failure(self, tool):
        result = await tool.run({"text": 999, "session_id": "s-001"})
        assert result.success is False


class TestBlockedPatterns:
    @pytest.mark.asyncio
    async def test_blocks_diagnosis_statement(self, tool):
        result = await tool.run({
            "text": "The patient has hypertension.",
            "session_id": "s-001",
        })
        assert result.success is False
        assert result.outcome == OutcomeStatus.BLOCKED
        assert "diagnosis_statement" in result.metadata["matched_categories"]

    @pytest.mark.asyncio
    async def test_blocks_you_have(self, tool):
        result = await tool.run({
            "text": "You have diabetes.",
            "session_id": "s-001",
        })
        assert result.success is False
        assert result.outcome == OutcomeStatus.BLOCKED

    @pytest.mark.asyncio
    async def test_blocks_definitive_condition(self, tool):
        result = await tool.run({
            "text": "This is certainly a cardiac event.",
            "session_id": "s-001",
        })
        assert result.success is False
        assert "definitive_condition" in result.metadata["matched_categories"]

    @pytest.mark.asyncio
    async def test_blocks_treatment_prescription(self, tool):
        result = await tool.run({
            "text": "Prescribe metformin 500mg daily.",
            "session_id": "s-001",
        })
        assert result.success is False
        assert "treatment_prescription" in result.metadata["matched_categories"]

    @pytest.mark.asyncio
    async def test_blocks_prognosis_statement(self, tool):
        result = await tool.run({
            "text": "The prognosis is poor.",
            "session_id": "s-001",
        })
        assert result.success is False
        assert "prognosis_statement" in result.metadata["matched_categories"]

    @pytest.mark.asyncio
    async def test_blocked_output_has_hash(self, tool):
        result = await tool.run({
            "text": "You have diabetes.",
            "session_id": "s-001",
        })
        assert "output_hash" in result.metadata
        assert len(result.metadata["output_hash"]) == 64


class TestSafeLanguage:
    @pytest.mark.asyncio
    async def test_safe_framing_passes(self, tool):
        text = (
            "Clinical features may suggest hypertensive urgency. "
            "Consider further investigation. "
            "Warrants physician review."
        )
        result = await tool.run({"text": text, "session_id": "s-001"})
        assert result.success is True
        assert result.output["blocked"] is False

    @pytest.mark.asyncio
    async def test_possible_language_passes(self, tool):
        result = await tool.run({
            "text": "Possible cardiac involvement based on symptoms.",
            "session_id": "s-001",
        })
        assert result.success is True

    @pytest.mark.asyncio
    async def test_consistent_with_language_passes(self, tool):
        result = await tool.run({
            "text": "Clinical features consistent with elevated BP.",
            "session_id": "s-001",
        })
        assert result.success is True

    @pytest.mark.asyncio
    async def test_clean_output_passes(self, tool):
        result = await tool.run({
            "text": "BP 148/92 with chest pain on exertion in known hypertensive.",
            "session_id": "s-001",
        })
        assert result.success is True
        assert result.output["patterns_checked"] > 0


class TestCaseInsensitive:
    @pytest.mark.asyncio
    async def test_uppercase_blocked(self, tool):
        result = await tool.run({
            "text": "PATIENT HAS HYPERTENSION.",
            "session_id": "s-001",
        })
        assert result.success is False

    @pytest.mark.asyncio
    async def test_mixed_case_blocked(self, tool):
        result = await tool.run({
            "text": "Diagnosis Is hypertension.",
            "session_id": "s-001",
        })
        assert result.success is False