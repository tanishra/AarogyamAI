import pytest
from agent_worker.agent.tools.pii_stripper import PIIStripperTool


@pytest.fixture
def tool() -> PIIStripperTool:
    return PIIStripperTool()


class TestToolInterface:
    def test_name(self, tool):
        assert tool.name == "PIIStripperTool"

    @pytest.mark.asyncio
    async def test_missing_text_returns_failure(self, tool):
        result = await tool.run({})
        assert result.success is False
        assert "text" in result.error

    @pytest.mark.asyncio
    async def test_non_string_text_returns_failure(self, tool):
        result = await tool.run({"text": 12345})
        assert result.success is False


class TestPhoneStripping:
    @pytest.mark.asyncio
    async def test_strips_isd_phone(self, tool):
        result = await tool.run({"text": "Call me at +919876543210"})
        assert result.success is True
        assert "+919876543210" not in result.output["stripped_text"]
        assert "phone" in result.output["categories_found"]

    @pytest.mark.asyncio
    async def test_strips_local_phone(self, tool):
        result = await tool.run({"text": "My number is 9876543210"})
        assert result.success is True
        assert "9876543210" not in result.output["stripped_text"]

    @pytest.mark.asyncio
    async def test_was_modified_true_when_pii_found(self, tool):
        result = await tool.run({"text": "Phone: 9876543210"})
        assert result.output["was_modified"] is True


class TestEmailStripping:
    @pytest.mark.asyncio
    async def test_strips_email(self, tool):
        result = await tool.run({"text": "Email me at patient@example.com"})
        assert result.success is True
        assert "patient@example.com" not in result.output["stripped_text"]
        assert "email" in result.output["categories_found"]


class TestAadhaarStripping:
    @pytest.mark.asyncio
    async def test_strips_aadhaar_with_spaces(self, tool):
        result = await tool.run({"text": "Aadhaar: 1234 5678 9012"})
        assert result.success is True
        assert "1234 5678 9012" not in result.output["stripped_text"]
        assert "aadhaar" in result.output["categories_found"]

    @pytest.mark.asyncio
    async def test_strips_aadhaar_without_spaces(self, tool):
        result = await tool.run({"text": "ID: 123456789012"})
        assert result.success is True
        assert "123456789012" not in result.output["stripped_text"]


class TestPANStripping:
    @pytest.mark.asyncio
    async def test_strips_pan(self, tool):
        result = await tool.run({"text": "PAN: ABCDE1234F"})
        assert result.success is True
        assert "ABCDE1234F" not in result.output["stripped_text"]
        assert "pan" in result.output["categories_found"]


class TestDOBStripping:
    @pytest.mark.asyncio
    async def test_strips_dob_slash_format(self, tool):
        result = await tool.run({"text": "Born on 15/08/1990"})
        assert result.success is True
        assert "15/08/1990" not in result.output["stripped_text"]

    @pytest.mark.asyncio
    async def test_strips_dob_dash_format(self, tool):
        result = await tool.run({"text": "DOB: 15-08-1990"})
        assert result.success is True
        assert "15-08-1990" not in result.output["stripped_text"]


class TestCleanText:
    @pytest.mark.asyncio
    async def test_clean_text_not_modified(self, tool):
        text = "Patient has chest pain for two days. No relief with rest."
        result = await tool.run({"text": text})
        assert result.success is True
        assert result.output["was_modified"] is False
        assert result.output["stripped_text"] == text
        assert result.output["categories_found"] == []

    @pytest.mark.asyncio
    async def test_input_hash_present(self, tool):
        result = await tool.run({"text": "some text"})
        assert result.success is True
        assert len(result.output["input_hash"]) == 64


class TestMultiplePII:
    @pytest.mark.asyncio
    async def test_multiple_pii_categories_stripped(self, tool):
        text = "Call +919876543210 or email test@test.com"
        result = await tool.run({"text": text})
        assert result.success is True
        assert "+919876543210" not in result.output["stripped_text"]
        assert "test@test.com" not in result.output["stripped_text"]
        assert len(result.output["categories_found"]) >= 2