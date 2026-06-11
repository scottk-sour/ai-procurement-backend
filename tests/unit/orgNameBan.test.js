import { describe, it, expect } from 'vitest';
import { detectPossibleFabrication } from '../../services/contentPlanner/writerGuards.js';

describe('detectPossibleFabrication — placeholder exemption', () => {
  it('does NOT flag org names inside [FIRM_DATA: ...] placeholders', () => {
    const text = 'Our fees are [FIRM_DATA: soleAgencyFeePercent | Your NAEA-registered commission rate]. We provide a quality service.';
    const flagged = detectPossibleFabrication(text);
    const naaeFlags = flagged.filter(f => f.body === 'NAEA');
    expect(naaeFlags.length).toBe(0);
  });

  it('does NOT flag org names inside [FIRM TO PROVIDE: ...] placeholders', () => {
    const text = 'Our SRA number is [FIRM TO PROVIDE: your SRA registration number with 6 digits]. We are fully regulated.';
    const flagged = detectPossibleFabrication(text);
    const sraFlags = flagged.filter(f => f.body === 'SRA');
    expect(sraFlags.length).toBe(0);
  });

  it('STILL flags fabricated org attribution outside placeholders', () => {
    const text = 'Propertymark data shows correctly priced homes sell 40% faster.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('STILL flags Rightmove fabrication', () => {
    const text = 'Rightmove analytics indicate Cardiff properties generate 40% more enquiries.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('does NOT flag qualitative text with org name but no number', () => {
    const text = 'NAEA-qualified team provides honest valuations based on local market knowledge.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBe(0);
  });
});

describe('ORG_NAME_BAN prompt constant', () => {
  it('contains all key organisation names and hard constraint language', async () => {
    // Read the file directly to avoid the deep mongoose import chain
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');
    expect(content).toContain('ABSOLUTE CONSTRAINT');
    expect(content).toContain('automatically rejected');
    expect(content).toContain('Land Registry');
    expect(content).toContain('Propertymark');
    expect(content).toContain('NAEA');
    expect(content).toContain('Rightmove');
    expect(content).toContain('SRA');
    expect(content).toContain('ICAEW');
    expect(content).toContain('FCA');
    expect(content).toContain('ONS');
  });
});
