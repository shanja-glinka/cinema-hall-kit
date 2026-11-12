import { useHallEditorContext } from '../context.js';
import { NumberField } from '../fields/NumberField.js';
import { formatLabel } from '../../labels/labels.js';

/**
 * Edits a shared hall tier in plain units with draft and policy handling.
 * @param props Tier id to edit.
 * @param props.tier Id of the price tier to edit.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <PriceField tier="standard" />
 */
export function PriceField({ tier }: { tier: string }) {
  const { editor, options } = useHallEditorContext();
  const tiers = editor.config.pricing?.tiers;
  const value = tiers && Object.hasOwn(tiers, tier) ? tiers[tier] : undefined;
  return (
    <NumberField
      key={tier}
      path={['pricing', 'tiers', tier]}
      label={formatLabel(options.labels.editor.seatPrice)}
      value={value}
      optional
      step={0.01}
      min={0}
      unit={options.labels.picker.priceSign}
      onCommit={(price) => editor.patch({ pricing: { tiers: { [tier]: price } } })}
    />
  );
}
