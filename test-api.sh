#!/bin/bash
# Test the doctor context API to see what vitals data is returned

# Replace with actual values
SESSION_ID="c49cff05-1f5d-49c6-b290-3d5cd89282a3"
PATIENT_ID="32227629-0da2-4016-860d-ac31c6a8f8c9"

# Login as doctor first to get token
echo "Testing doctor context API..."
curl -s "http://localhost:3001/api/doctor/patient/${PATIENT_ID}/context?sessionId=${SESSION_ID}" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq '.data.vitals'
