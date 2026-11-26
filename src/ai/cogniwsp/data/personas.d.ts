export interface PersonaSpec {
  name: string;
  emoji: string;
  lexicon: Record<string, string>;
}

export type PersonaDictionary = Readonly<Record<string, PersonaSpec>>;

export const PERSONAS: Readonly<{
  tavern: PersonaSpec;
  cyberpunk: PersonaSpec;
  spirit: PersonaSpec;
  scholar: PersonaSpec;
  mechanic: PersonaSpec;
}>;

export default PERSONAS;
