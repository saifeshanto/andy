import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoneyRM } from './MoneyRM';

describe('MoneyRM', () => {
  it('renders sen as ringgit', () => {
    render(<MoneyRM sen={39900} />);
    expect(screen.getByText('RM 399.00')).toBeTruthy();
  });
});
