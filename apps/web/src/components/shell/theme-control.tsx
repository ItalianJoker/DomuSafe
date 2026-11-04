import { Label } from '@/components/ui/label.js';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.js';
import { isThemePreference, type ThemePreference } from '@/lib/theme.js';
import { m } from '@/paraglide/messages.js';

/**
 * Light, dark or automatic theme.
 *
 * Preconditions: `value` is the current preference.
 * Postconditions: `onChange` receives only a valid preference.
 * Data contract: the three labels are the product names Chiaro, Scuro, Automatico.
 *
 * @param props - Value and change handler.
 * @returns The control.
 */
export function ThemeControl(props: {
  readonly value: ThemePreference;
  readonly onChange: (theme: ThemePreference) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{m.themeLabel()}</Label>
      <RadioGroup
        value={props.value}
        onValueChange={(value) => {
          if (isThemePreference(value)) {
            props.onChange(value);
          }
        }}
        aria-label={m.themeLabel()}
      >
        <RadioGroupItem value="light">{m.themeLight()}</RadioGroupItem>
        <RadioGroupItem value="dark">{m.themeDark()}</RadioGroupItem>
        <RadioGroupItem value="system">{m.themeAuto()}</RadioGroupItem>
      </RadioGroup>
      <p className="text-[12px] text-muted-foreground">{m.themeHelp()}</p>
    </div>
  );
}
