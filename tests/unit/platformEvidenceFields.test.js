import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { PLATFORM_DATA_SOURCE } from '../../services/platformQuery/dataSource.js';

const { default: AeoReport } = await import('../../models/AeoReport.js');

describe('AeoReport platformResults evidence fields', () => {
  it('schema accepts rawResponse, promptTested, dataSource', () => {
    const doc = new AeoReport({
      companyName: 'Test Co',
      category: 'conveyancing',
      city: 'Cardiff',
      aiMentioned: true,
      platformResults: [{
        platform: 'perplexity',
        platformLabel: 'Perplexity',
        mentioned: true,
        status: 'checked',
        position: 1,
        snippet: 'Test Co is a great firm.',
        competitors: [{ name: 'Rival Ltd', reason: 'Nearby' }],
        rawResponse: 'Here are some firms in Cardiff...',
        promptTested: 'You are helping a potential customer find a conveyancing solicitor in Cardiff, UK.',
        dataSource: 'live_web',
      }],
    });

    const pr = doc.platformResults[0];
    expect(pr.rawResponse).toBe('Here are some firms in Cardiff...');
    expect(pr.promptTested).toContain('conveyancing solicitor');
    expect(pr.dataSource).toBe('live_web');
  });

  it('legacy documents without evidence fields read as null', () => {
    const doc = new AeoReport({
      companyName: 'Old Co',
      category: 'copiers',
      city: 'London',
      aiMentioned: false,
      platformResults: [{
        platform: 'chatgpt',
        platformLabel: 'ChatGPT',
        mentioned: false,
        status: 'checked',
      }],
    });

    const pr = doc.platformResults[0];
    expect(pr.rawResponse).toBeNull();
    expect(pr.promptTested).toBeNull();
    expect(pr.dataSource).toBeNull();
  });

  it('dataSource enum rejects invalid values', () => {
    const doc = new AeoReport({
      companyName: 'Bad Co',
      category: 'it',
      city: 'Bristol',
      aiMentioned: false,
      platformResults: [{
        platform: 'claude',
        platformLabel: 'Claude',
        mentioned: false,
        status: 'checked',
        dataSource: 'invalid_source',
      }],
    });

    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['platformResults.0.dataSource']).toBeDefined();
  });
});

describe('PLATFORM_DATA_SOURCE config', () => {
  it('perplexity and chatgpt are live_web', () => {
    expect(PLATFORM_DATA_SOURCE.perplexity).toBe('live_web');
    expect(PLATFORM_DATA_SOURCE.chatgpt).toBe('live_web');
  });

  it('claude, gemini, grok, meta are training_data', () => {
    expect(PLATFORM_DATA_SOURCE.claude).toBe('training_data');
    expect(PLATFORM_DATA_SOURCE.gemini).toBe('training_data');
    expect(PLATFORM_DATA_SOURCE.grok).toBe('training_data');
    expect(PLATFORM_DATA_SOURCE.meta).toBe('training_data');
  });

  it('all 6 platforms have an entry', () => {
    const keys = Object.keys(PLATFORM_DATA_SOURCE);
    expect(keys).toHaveLength(6);
    for (const k of ['perplexity', 'chatgpt', 'claude', 'gemini', 'grok', 'meta']) {
      expect(keys).toContain(k);
    }
  });
});
