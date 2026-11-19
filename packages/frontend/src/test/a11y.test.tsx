import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

describe('a11y — core components', () => {
  it('LoadingSpinner has no violations', async () => {
    const { container } = render(<LoadingSpinner />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ErrorBoundary (children path) has no violations', async () => {
    const { container } = render(
      <ErrorBoundary>
        <div>content</div>
      </ErrorBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
