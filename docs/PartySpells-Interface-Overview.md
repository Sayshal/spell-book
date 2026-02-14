# PartySpells Interface Overview

A specialized window for viewing and coordinating spells across all party members. Helps optimize spellcasting roles and reduce redundant preparations in multi-caster parties.

---

## Accessing Party Spells

Open the Party Spell Interface using the Spell Book icon on the **Group Actor Sheet** tab, or via the **Party Manager** button in the SpellBook footer.

---

## Member Cards

Each party member is displayed as a card showing their name, class, and assigned focus.

- **Click** a member card to filter the spell list to that member's prepared spells
- **Hover** over a member card to highlight their prepared spells in the list
- **Right-click** a member card to open a context menu with **Open Actor**

---

## Spell Display

Spells are organized by level with collapsible sections.

- Each spell shows which party members have it prepared
- Spell levels can be collapsed/expanded with persisted state
- Use the **Refresh** button to manually update spell data from all party members

---

## Focus Settings

The Focus Settings dialog configures spellcasting focus distribution across the party.

### Default Focuses

The module ships with 10 default focuses: Arcanist, Buffer, Crowd Controller, Offensive Mage, Protector, Support, Brawler Mage, Elementalist, Summoner, and Utility.

### Customization

- GMs can create additional custom focus options
- GMs can assign focuses to any party member
- Players can only set their own focus — they cannot manage focus definitions or assign others

---

## Party Synergy Analysis

Detailed analysis of party spell composition across multiple dimensions:

### Coverage Analysis

- **Concentration percentage** — What percentage of prepared spells require concentration (warns if >60%)
- **Ritual count** — How many ritual spells the party has access to (warns if low)
- **Damage type diversity** — Which damage types are represented and which are missing (warns if limited)

### Component Analysis

- Verbal, Somatic, and Material component distribution across prepared spells

### Distribution Breakdowns

- **Range analysis** — Distribution of spell ranges across the party
- **Duration analysis** — Breakdown of spell durations
- **Saving throw distribution** — Which saves the party's spells target
- **Spell school distribution** — Coverage across all eight spell schools
- **Spell level distribution** — How prepared spells are spread across levels
- **Focus distribution** — How party members are distributed across focuses

### Warnings

The analysis generates specific warnings when:

- Concentration spells exceed 60% of total prepared spells
- Ritual spell coverage is low
- Damage type variety is limited
- Focus assignments are unbalanced
