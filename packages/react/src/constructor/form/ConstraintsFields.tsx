import { DEFAULT_CONSTRAINTS, pathToString, type Constraints } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import { editorLabel } from '../../labels/editor-labels.js';
import { CONSTRAINT_LABELS } from '../ui/names.js';
import { NumberField } from '../fields/NumberField.js';

interface ConstraintSpec {
  key: keyof Constraints;
  unit?: 'm' | 'deg';
}

/** Thresholds of the checks. Empty means the library default, shown as the placeholder. */
const SPECS: readonly ConstraintSpec[] = [
  { key: 'minAisleWidth', unit: 'm' },
  { key: 'minWallClearance', unit: 'm' },
  { key: 'minRearClearance', unit: 'm' },
  { key: 'minLegroom', unit: 'm' },
  { key: 'minHeadroom', unit: 'm' },
  { key: 'minFirstRowDistanceRatio' },
  { key: 'maxFrontRowVerticalAngle', unit: 'deg' },
  { key: 'headAboveEye', unit: 'm' },
];

/**
 * Hall check limits (eye height, viewing angles); fields follow the edit policy.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <ConstraintsFields />
 */
export function ConstraintsFields() {
  const { editor, options } = useHallEditorContext();
  const L = options.labels.editor;
  const constraints = editor.config.constraints ?? {};
  return (
    <div data-chk="editor-grid" tabIndex={-1} data-chk-path={pathToString(['constraints'])}>
      {SPECS.map((spec) => (
        <NumberField
          key={spec.key}
          path={['constraints', spec.key]}
          label={formatLabel(editorLabel(L, CONSTRAINT_LABELS[spec.key]))}
          unit={
            spec.unit === 'm'
              ? formatLabel(L.unitMetres)
              : spec.unit === 'deg'
                ? formatLabel(L.unitDegrees)
                : undefined
          }
          optional
          value={constraints[spec.key]}
          placeholder={DEFAULT_CONSTRAINTS[spec.key]}
          onCommit={(value) => editor.patch({ constraints: { [spec.key]: value } })}
        />
      ))}
    </div>
  );
}
