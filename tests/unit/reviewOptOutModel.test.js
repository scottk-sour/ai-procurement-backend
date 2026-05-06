import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';

const { default: ReviewOptOut } = await import('../../models/ReviewOptOut.js');

describe('ReviewOptOut Model', () => {
  it('validates required fields', () => {
    const doc = new ReviewOptOut({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.email).toBeDefined();
  });

  it('accepts valid document', () => {
    const doc = new ReviewOptOut({
      email: 'test@example.com',
      vendor: new mongoose.Types.ObjectId(),
      source: 'unsubscribe_link',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects invalid source enum', () => {
    const doc = new ReviewOptOut({
      email: 'test@example.com',
      source: 'invalid_source',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.source).toBeDefined();
  });

  it('defaults vendor to null for global opt-out', () => {
    const doc = new ReviewOptOut({ email: 'test@example.com' });
    expect(doc.vendor).toBeNull();
  });

  it('lowercases email', () => {
    const doc = new ReviewOptOut({ email: 'TEST@EXAMPLE.COM' });
    expect(doc.email).toBe('test@example.com');
  });

  it('has unique compound index on email + vendor', () => {
    const indexes = ReviewOptOut.schema.indexes();
    const found = indexes.find(([fields, opts]) =>
      fields.email === 1 && fields.vendor === 1 && opts?.unique === true
    );
    expect(found).toBeDefined();
  });

  it('has isOptedOut static method', () => {
    expect(typeof ReviewOptOut.isOptedOut).toBe('function');
  });
});
