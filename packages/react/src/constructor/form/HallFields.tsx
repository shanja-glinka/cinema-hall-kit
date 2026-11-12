import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import { ColorField } from '../fields/ColorField.js';
import { NumberField } from '../fields/NumberField.js';
import { TextField } from '../fields/TextField.js';

/**
 * Hall name and box: width, depth, height, and the optional wall and floor colours.
 * @returns Name, size and colour fields of the hall.
 * @example <HallFields />
 */
export function HallFields() {
  const { editor, options } = useHallEditorContext();
  const L = options.labels.editor;
  const { hall, name } = editor.config;
  return (
    <div data-chk="editor-grid">
      <TextField
        path={['name']}
        label={formatLabel(L.name)}
        value={name}
        onCommit={(next) => editor.patch({ name: next })}
      />
      <NumberField
        path={['hall', 'width']}
        label={formatLabel(L.hallWidth)}
        unit={formatLabel(L.unitMetres)}
        value={hall.width}
        onCommit={(width) => editor.patch({ hall: { width } })}
      />
      <NumberField
        path={['hall', 'depth']}
        label={formatLabel(L.hallDepth)}
        unit={formatLabel(L.unitMetres)}
        value={hall.depth}
        onCommit={(depth) => editor.patch({ hall: { depth } })}
      />
      <NumberField
        path={['hall', 'height']}
        label={formatLabel(L.hallHeight)}
        unit={formatLabel(L.unitMetres)}
        value={hall.height}
        onCommit={(height) => editor.patch({ hall: { height } })}
      />
      <ColorField
        path={['hall', 'wallColor']}
        label={formatLabel(L.wallColor)}
        value={hall.wallColor}
        optional
        onCommit={(wallColor) => editor.patch({ hall: { wallColor } })}
      />
      <ColorField
        path={['hall', 'floorColor']}
        label={formatLabel(L.floorColor)}
        value={hall.floorColor}
        optional
        onCommit={(floorColor) => editor.patch({ hall: { floorColor } })}
      />
    </div>
  );
}

/**
 * Screen size, its bottom edge above the floor, and an optional curve.
 * @returns Width, height, bottom edge and curvature fields of the screen.
 * @example <ScreenFields />
 */
export function ScreenFields() {
  const { editor, options } = useHallEditorContext();
  const L = options.labels.editor;
  const { screen } = editor.config;
  const metres = formatLabel(L.unitMetres);
  return (
    <div data-chk="editor-grid">
      <NumberField
        path={['screen', 'width']}
        label={formatLabel(L.screenWidth)}
        unit={metres}
        value={screen.width}
        onCommit={(width) => editor.patch({ screen: { width } })}
      />
      <NumberField
        path={['screen', 'height']}
        label={formatLabel(L.screenHeight)}
        unit={metres}
        value={screen.height}
        onCommit={(height) => editor.patch({ screen: { height } })}
      />
      <NumberField
        path={['screen', 'elevation']}
        label={formatLabel(L.screenElevation)}
        unit={metres}
        value={screen.elevation}
        onCommit={(elevation) => editor.patch({ screen: { elevation } })}
      />
      <NumberField
        path={['screen', 'curvature']}
        label={formatLabel(L.screenCurvature)}
        unit={metres}
        value={screen.curvature}
        optional
        placeholder={0}
        onCommit={(curvature) => editor.patch({ screen: { curvature } })}
      />
    </div>
  );
}
