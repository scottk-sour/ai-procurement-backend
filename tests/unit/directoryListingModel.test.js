import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';

const { default: DirectoryListing } = await import('../../models/DirectoryListing.js');

describe('DirectoryListing Model', () => {
  it('validates required fields', () => {
    const doc = new DirectoryListing({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.vendorId).toBeDefined();
    expect(err.errors.directory).toBeDefined();
  });

  it('accepts valid directory enum values', () => {
    const doc = new DirectoryListing({
      vendorId: new mongoose.Types.ObjectId(),
      directory: 'yell',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects invalid directory enum', () => {
    const doc = new DirectoryListing({
      vendorId: new mongoose.Types.ObjectId(),
      directory: 'invalid_directory',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.directory).toBeDefined();
  });

  it('rejects invalid status enum', () => {
    const doc = new DirectoryListing({
      vendorId: new mongoose.Types.ObjectId(),
      directory: 'yell',
      status: 'bogus',
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.status).toBeDefined();
  });

  it('defaults status to queued', () => {
    const doc = new DirectoryListing({
      vendorId: new mongoose.Types.ObjectId(),
      directory: 'freeindex',
    });
    expect(doc.status).toBe('queued');
  });

  it('has unique compound index on vendorId + directory', () => {
    const indexes = DirectoryListing.schema.indexes();
    const found = indexes.find(([fields, opts]) =>
      fields.vendorId === 1 && fields.directory === 1 && opts?.unique === true
    );
    expect(found).toBeDefined();
  });
});
