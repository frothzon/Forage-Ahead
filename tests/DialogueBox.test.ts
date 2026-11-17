import { describe, expect, it } from 'vitest';
import { parseRichDialogue } from '../src/ui/DialogueBox';

describe('parseRichDialogue', () => {
  it('parses color and animated text effect tags into per-character tokens', () => {
    const tokens = parseRichDialogue('Hi {c:#ffe066}{bounce}Hero{/bounce}{/c}!');
    expect(tokens.map((t) => t.ch).join('')).toBe('Hi Hero!');
    expect(tokens[0]).toEqual({ ch: 'H', color: undefined, effect: undefined });
    expect(tokens[3]).toEqual({ ch: 'H', color: '#ffe066', effect: 'bounce' });
    expect(tokens[6]).toEqual({ ch: 'o', color: '#ffe066', effect: 'bounce' });
    expect(tokens[7]).toEqual({ ch: '!', color: undefined, effect: undefined });
  });

  it('supports jiggle and roll effects', () => {
    const tokens = parseRichDialogue('{jiggle}Danger{/jiggle} {roll}Magic{/roll}');
    expect(tokens[0].effect).toBe('jiggle');
    expect(tokens[6].effect).toBeUndefined();
    expect(tokens[7].effect).toBe('roll');
  });
});
