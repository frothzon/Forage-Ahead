import { describe, expect, it } from 'vitest';
import { computeTileProgress, computeTransitionGrid, easeInOutCubic } from '../src/core/TransitionManager';
import { TransitionShapeLibrary } from '../src/core/TransitionShapeLibrary';

describe('TransitionGrid & Wave Math', () => {
  it('computes ~20 integer-aligned columns across desktop and mobile viewports', () => {
    for (const [w, h] of [
      [1280, 720],
      [1920, 1080],
      [844, 390],
    ]) {
      const grid = computeTransitionGrid(w, h);
      expect(Number.isInteger(grid.cellSize)).toBe(true);
      expect(grid.cols).toBeGreaterThanOrEqual(18);
      expect(grid.cols).toBeLessThanOrEqual(24);
      expect(grid.cols * grid.cellSize).toBeGreaterThanOrEqual(w);
      expect(grid.rows * grid.cellSize).toBeGreaterThanOrEqual(h);
    }
  });

  it('staggers wave from top-left (0,0) to bottom-right (cols-1, rows-1) over 1000ms phase', () => {
    const cols = 20;
    const rows = 12;
    const phaseMs = 1000;

    // Top-left starts immediately and finishes at 400ms
    expect(computeTileProgress(0, 0, cols, rows, 0, phaseMs)).toBe(0);
    expect(computeTileProgress(0, 0, cols, rows, 200, phaseMs)).toBeCloseTo(0.5, 5);
    expect(computeTileProgress(0, 0, cols, rows, 400, phaseMs)).toBe(1);

    // Bottom-right starts at 600ms and finishes at 1000ms
    expect(computeTileProgress(cols - 1, rows - 1, cols, rows, 599, phaseMs)).toBe(0);
    expect(computeTileProgress(cols - 1, rows - 1, cols, rows, 800, phaseMs)).toBeCloseTo(0.5, 5);
    expect(computeTileProgress(cols - 1, rows - 1, cols, rows, 1000, phaseMs)).toBe(1);

    // Every tile is 1 at phase completion
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(computeTileProgress(c, r, cols, rows, 1000, phaseMs)).toBe(1);
      }
    }
  });

  it('easeInOutCubic maps [0, 1] monotonically with endpoints 0 and 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

describe('TransitionShapeLibrary', () => {
  it('registers curated lucide and procedural shapes and avoids immediate repeats', () => {
    const names = TransitionShapeLibrary.getShapeNames();
    expect(names.length).toBeGreaterThanOrEqual(20);
    expect(names).toContain('star');
    expect(names).toContain('sword');
    expect(names).toContain('circle');

    let prev = TransitionShapeLibrary.getRandomShape(true).name;
    for (let i = 0; i < 15; i++) {
      const next = TransitionShapeLibrary.getRandomShape(true);
      expect(next.name).not.toBe(prev);
      expect(next.maxScale).toBeGreaterThanOrEqual(1.8);
      prev = next.name;
    }
  });
});
