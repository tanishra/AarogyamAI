# Doctor Differential Diagnosis Components

Minimal MVP components for managing differential diagnoses in the doctor workflow.

## Components

### DifferentialManager

Main container component that handles all differential diagnosis operations.

**Usage:**

```tsx
import { DifferentialManager } from '@/components/doctor';

function DoctorReview() {
  const encounterId = 'session-id-here';
  
  return (
    <DifferentialManager
      encounterId={encounterId}
      initialDifferentials={[]}
      onUpdate={() => {
        // Optional: refresh other data when differentials change
        console.log('Differentials updated');
      }}
    />
  );
}
```

**Props:**
- `encounterId` (string, required): The session/encounter ID
- `initialDifferentials` (Differential[], optional): Initial list of differentials
- `onUpdate` (function, optional): Callback when differentials are updated

### DifferentialList

Display component for the list of differential diagnoses with drag-to-reorder.

**Features:**
- Drag and drop to reorder diagnoses by priority
- Visual indicators for AI vs physician-added diagnoses
- Remove button for each diagnosis
- Shows ICD-10 codes and clinical reasoning

### AddDifferentialForm

Form component for adding new differential diagnoses with ICD-10 search.

**Features:**
- Real-time ICD-10 code search with autocomplete
- Debounced search (300ms)
- Priority selection (1-10)
- Optional clinical reasoning text
- Form validation

## API Endpoints Used

The components connect to these backend endpoints:

- `POST /api/doctor/encounters/:encounterId/differentials` - Add diagnosis
- `GET /api/doctor/encounters/:encounterId/differentials` - Get all differentials
- `DELETE /api/doctor/encounters/:encounterId/differentials/:id` - Remove diagnosis
- `PUT /api/doctor/encounters/:encounterId/differentials/order` - Reorder diagnoses
- `GET /api/doctor/diagnoses/search?q=query` - Search ICD-10 codes

## Data Types

```typescript
interface Diagnosis {
  code: string;        // ICD-10 code
  name: string;        // Diagnosis name
  category?: string;   // Optional category
}

interface Differential {
  id: string;
  diagnosis: Diagnosis;
  priority: number;
  source: 'ai' | 'physician';
  clinicalReasoning?: string;
  confidence?: number;
  addedBy: string;
  addedAt: string;
}
```

## Integration Example

Add to existing doctor review page:

```tsx
import { DifferentialManager } from '@/components/doctor';

// Inside your component:
<section className="animate-fade-up delay-3">
  <DifferentialManager
    encounterId={sessionId}
    onUpdate={() => refetch()}
  />
</section>
```

## Styling

Components use the existing design system:
- `ui-surface` for card backgrounds
- `AnimatedButton` for actions
- Tailwind CSS for styling
- Consistent with existing doctor workflow components
