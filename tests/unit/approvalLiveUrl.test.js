import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Use real ApprovalQueue model for schema validation
const { default: ApprovalQueue } = await import('../../models/ApprovalQueue.js');

describe('ApprovalQueue liveUrl field', () => {
  it('schema includes liveUrl field with default null', () => {
    const paths = ApprovalQueue.schema.paths;
    expect(paths.liveUrl).toBeDefined();
    expect(paths.liveUrl.instance).toBe('String');
    expect(paths.liveUrl.defaultValue).toBeNull();
  });

  it('liveUrl can be set on a document', () => {
    const doc = new ApprovalQueue({
      vendorId: new mongoose.Types.ObjectId(),
      agentName: 'writer',
      itemType: 'content_draft',
      title: 'Test',
      draftPayload: { title: 'Test', body: 'Body' },
      status: 'executed',
      liveUrl: 'https://tendorai.com/resources/test-slug-abc123',
    });
    expect(doc.liveUrl).toBe('https://tendorai.com/resources/test-slug-abc123');
  });

  it('liveUrl defaults to null when not set', () => {
    const doc = new ApprovalQueue({
      vendorId: new mongoose.Types.ObjectId(),
      agentName: 'writer',
      itemType: 'content_draft',
      title: 'Test',
      draftPayload: { title: 'Test', body: 'Body' },
    });
    expect(doc.liveUrl).toBeNull();
  });

  it('liveUrl is included in toJSON output', () => {
    const doc = new ApprovalQueue({
      vendorId: new mongoose.Types.ObjectId(),
      agentName: 'writer',
      itemType: 'content_draft',
      title: 'Test',
      draftPayload: { title: 'Test', body: 'Body' },
      liveUrl: 'https://tendorai.com/resources/my-post-abc123',
    });
    const json = doc.toJSON();
    expect(json.liveUrl).toBe('https://tendorai.com/resources/my-post-abc123');
  });
});
