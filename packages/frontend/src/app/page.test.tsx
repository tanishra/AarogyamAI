import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home Page', () => {
  it('renders the admin panel heading', () => {
    render(<Home />);
    expect(screen.getByText('Admin Panel')).toBeDefined();
  });

  it('renders the description', () => {
    render(<Home />);
    expect(
      screen.getByText('Administrative interface for AI-Assisted Clinical Reasoning System')
    ).toBeDefined();
  });
});
