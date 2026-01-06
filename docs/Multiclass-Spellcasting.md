# Multiclass Spellcasting

## Multiclass Support

### Tab Management
The Spell Book dynamically generates tabs for each spellcasting class a character possesses.
- Dynamic Tab Creation:
    When a character has more than one spellcasting class, a separate tab is created for each class. Tabs update automatically when a new class is added.
- Class-Specific Interface Elements:
    Each tab displays information relevant to that class:
    - Available spells
    - Spell preparation rules
    - Spell slots
    - Always-prepared or granted spells

- Visual Differentiation Between Classes:
    Tabs are color-coded and labeled with the class icon, making it easy to switch between classes and quickly identify the correct interface for spell preparation and casting.

### Spell Slot Calculation

Multiclass spellcasters combine spell slots according to D&D 5e rules.

- Multiclass Spell Slot Rules:
    The system automatically calculates combined spell slots based on class levels and casting type. Spell slot progression follows the rules outlined in the SRD.

- Spell Slot Sharing Between Classes:
    Shared spell slots are available to all spellcasting classes, while class-specific spell lists determine which spells can be cast with those slots.

- Pact Magic Integration:
    Warlock pact magic slots are tracked separately but are integrated into the character’s interface for convenience. The system ensures pact magic and multiclass spell slots do not interfere with one another.

### Preparation Management

Each spellcasting class maintains its own preparation rules and limits.

- Cross-Class Spell Access:
    While spell slots are shared, spells must be prepared in the appropriate class tab. A wizard cannot prepare a cleric spell without it being included in a cleric list assigned to the character's wizard spell book.
- Preparation Limit Calculations:
    The system enforces preparation limits per class. Always-prepared and granted spells are accounted for separately to prevent errors.

## Advanced Multiclass Features

### Class-specific restrictions
Spell Book will only allow preperation of spells asigned to a specific class.
Your wizard/cleric multiclassed character can only use their wizard preperation slots for wizard spells and the cleric slots for cleric spells.

### Subclass spell integration
- Subclass-granted spells are displayed alongside base class spell lists.
- The system handles always-prepared, granted, and optional subclass spells.
- Subclass integration ensures that additional features (like Domain or Circle spells) are automatically included in preparation calculations and spell slot usage.