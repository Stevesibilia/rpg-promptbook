import { describe, expect, it } from 'vitest';
import { projectRow, setGdrarchive, summarize } from '../src/index.js';
import { project } from './helpers.js';

const campaign = { id: '00000000-0000-4000-8000-0000000000c1', title: 'Cronaca del Gabbiano' };
const dates = { createdAt: '2026-10-01T10:00:00.000Z', editedAt: '2026-10-20T09:00:00.000Z', deletedAt: null };

describe('project row', () => {
  it('is the summary with the dates', () => {
    const summary = summarize(project({ document: 'Testo.' }), { campaigns: [] });
    expect(projectRow(summary, dates, [])).toEqual({ ...summary, ...dates });
  });

  it('keeps a link to a live campaign and reads any other as stand-alone', () => {
    const summary = summarize(project({ campaignId: campaign.id }), { campaigns: [campaign] });
    expect(summary.campaignId).toBe(campaign.id);
    expect(projectRow(summary, dates, [campaign]).campaignId).toBe(campaign.id);
    // The campaign in the bin or gone: not among the live campaigns.
    expect(projectRow(summary, dates, []).campaignId).toBeNull();
    expect(projectRow(summary, dates, [{ id: '00000000-0000-4000-8000-0000000000c2' }]).campaignId).toBeNull();
  });

  it('carries the own gdrarchive link of a campaign and of an adventure', () => {
    const link = { url: 'https://gdrarchive.siberio.eu/campaigns/12', label: 'Kulthos' };
    const kulthos = project({ id: campaign.id, category: 'campaign' });
    setGdrarchive(kulthos, link);
    expect(projectRow(summarize(kulthos, { campaigns: [campaign] }), dates, []).gdrarchive).toEqual(link);
    const adventure = project({ category: 'adventure', campaignId: campaign.id });
    setGdrarchive(adventure, { ...link, label: '' });
    const row = projectRow(summarize(adventure, { campaigns: [campaign] }), dates, [campaign]);
    expect(row.gdrarchive).toEqual({ ...link, label: '' });
  });
});
