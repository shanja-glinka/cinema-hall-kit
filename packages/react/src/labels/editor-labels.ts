/**
 * English labels of the hall constructor. Placeholders are `{name}` and are filled by `formatLabel`.
 */
import type { Label } from './labels.js';

/** Complete constructor text dictionary; placeholders are resolved with formatLabel. */
export interface EditorLabels {
  hallDimensions: Label;
  screenDimensions: Label;
  advanced: Label;
  inspectorAria: Label;
  planAria: Label;
  summary: Label;
  selectHint: Label;
  planHint: Label;
  fit: Label;
  exportAction: Label;
  sectionTitle: Label;
  bandCanvas: Label;
  addRight: Label;
  addBand: Label;
  seatPrice: Label;
  seatTypesPrices: Label;
  editTypes: Label;
  sharedPrice: Label;
  excludeMode: Label;
  excludeHint: Label;
  seatAction: Label;
  seatCount: Label;
  revenue: Label;
  priceMissing: Label;
  closeInspector: Label;
  moveLeft: Label;
  moveRight: Label;
  /** `{count}`: the number of errors on the Save button ("1 error", "3 errors"). */
  errorCount: Label;
  centreName: Label;
  leftName: Label;
  rightName: Label;
  mainName: Label;
  reclinerName: Label;
  standardName: Label;
  unavailableType: Label;
  emptyBand: Label;
  seatsBooked: Label;
  // toolbar and status
  title: Label;
  templates: Label;
  templatesAria: Label;
  importAction: Label;
  importTitle: Label;
  importHint: Label;
  importFile: Label;
  importApply: Label;
  importDone: Label;
  cancel: Label;
  /** `{line}`, `{col}` */
  position: Label;
  download: Label;
  copy: Label;
  copied: Label;
  copyFailed: Label;
  undo: Label;
  redo: Label;
  unsaved: Label;
  readOnly: Label;
  /** `{reason}` */
  rejected: Label;
  /** `{id}` */
  notFound: Label;
  save: Label;
  saving: Label;
  saved: Label;
  saveBlocked: Label;
  saveInvalid: Label;
  saveConflict: Label;
  loadServer: Label;
  saveInUse: Label;
  /** `{message}` */
  saveError: Label;
  // layout and panels
  formAria: Label;
  previewAria: Label;
  tabsAria: Label;
  tabForm: Label;
  tabPreview: Label;
  view3d: Label;
  viewMap: Label;
  viewSplit: Label;
  // issues
  issuesTitle: Label;
  noIssues: Label;
  /** `{count}` */
  errorsGroup: Label;
  /** `{count}` */
  warningsGroup: Label;
  // accordion titles
  sectionHall: Label;
  sectionScreen: Label;
  sectionSeatTypes: Label;
  sectionBands: Label;
  sectionConstraints: Label;
  sectionZones: Label;
  sectionExtra: Label;
  // hall and screen
  name: Label;
  hallWidth: Label;
  hallDepth: Label;
  hallHeight: Label;
  wallColor: Label;
  floorColor: Label;
  screenWidth: Label;
  screenHeight: Label;
  screenElevation: Label;
  screenCurvature: Label;
  unitMetres: Label;
  unitDegrees: Label;
  colorPicker: Label;
  // seat types
  seatTypeAdd: Label;
  seatTypeId: Label;
  seatTypeLabel: Label;
  seatTypeWidth: Label;
  seatTypeDepth: Label;
  seatTypeColor: Label;
  newSeatType: Label;
  /** `{name}` */
  removeNamed: Label;
  // layout block
  firstRowDistance: Label;
  rowLabels: Label;
  rowLabelsAlphabetic: Label;
  rowLabelsNumeric: Label;
  rowLabelsCustom: Label;
  seatNumbering: Label;
  numberingContinuous: Label;
  numberingPerSection: Label;
  eyeHeight: Label;
  // bands and sections
  bandAdd: Label;
  /** `{id}` */
  bandTitle: Label;
  bandGapBefore: Label;
  bandRiser: Label;
  /** Display name of a band. */
  bandLabel?: Label;
  /** Distance from the screen to the band's first row, when the band is placed on its own. */
  bandStartDistance?: Label;
  /** Floor height of the band's first row. */
  bandElevation?: Label;
  /** Hint under the band's start distance and floor height. */
  bandPlacementHint?: Label;
  /** Hint under a section's aisle field. */
  sectionGapHint?: Label;
  bandDefaults: Label;
  sectionAdd: Label;
  sectionId: Label;
  sectionSeats: Label;
  sectionGap: Label;
  sectionRows: Label;
  sectionRowSpacing: Label;
  sectionSeatPitch: Label;
  sectionSeatType: Label;
  sectionPriceTier: Label;
  sectionColor: Label;
  sectionExclude: Label;
  sectionExcludeHint: Label;
  /** `{value}`: the band value shown when a section inherits it */
  inheritedValue: Label;
  /** Option for a select whose value is inherited from the band, when the band has none. */
  none: Label;
  resetToBand: Label;
  up: Label;
  down: Label;
  duplicate: Label;
  remove: Label;
  removeBand: Label;
  /** Shown under Remove when the section is the only one of its band: the band goes with it. */
  removesBand: Label;
  /** Closes a notice. */
  dismiss: Label;
  /** Display name of a generated band id (`band-3`); `{n}` is the number. */
  generatedBand: Label;
  /** Display name of a generated section id (`section-4`). */
  generatedSection: Label;
  /** A field-level issue: `{field}` is the field label, `{message}` the lower-cased reason. */
  issueField: Label;
  issueFitDepth: Label;
  issueMinBands: Label;
  issueMinSections: Label;
  undoTip: Label;
  redoTip: Label;
  /** `{name}` */
  moveUpNamed: Label;
  /** `{name}` */
  moveDownNamed: Label;
  /** `{name}` */
  duplicateNamed: Label;
  // constraints
  cMinAisleWidth: Label;
  cMinWallClearance: Label;
  cMinRearClearance: Label;
  cMinLegroom: Label;
  cMinHeadroom: Label;
  cFirstRowRatio: Label;
  cMaxFrontAngle: Label;
  cHeadAboveEye: Label;
  cMinOverhangClearance?: Label;
  cBalconySlabThickness?: Label;
  cBalconyParapetHeight?: Label;
  // viewing zones
  zoneAdd: Label;
  zoneLabel: Label;
  zoneMinFov: Label;
  newZone: Label;
  // extra fields
  extraEmpty: Label;
  // field messages
  fieldNumber: Label;
  fieldInteger: Label;
  /** `{min}`, `{max}` */
  fieldRange: Label;
  /** `{min}` */
  fieldMin: Label;
  /** `{max}` */
  fieldMax: Label;
  fieldHex: Label;
  locked: Label;
  // library templates (host templates keep their own label)
  templateThreeSections: Label;
  templateSingle: Label;
  templateStadium: Label;
  // preview and reordering
  /** `{keys}`: seat keys in use that the pending edit removes */
  seatsRemoved: Label;
  /** The saved hall shown after `seats_in_use`, with those seats highlighted. */
  seatsInUseCaption: Label;
  /** Returns the preview from the saved hall to the edited one. */
  showEditedHall: Label;
  /** `{name}`, `{position}`, `{total}`: announced after a move */
  movedTo: Label;
  dragHandle: Label;
  // save state, hints and fixes
  /** Toolbar state when the hall has no unsaved changes after a save. */
  allSaved?: Label;
  /** Short note next to a field whose new value is now in the draft (it still has to be saved). */
  applied?: Label;
  /** `{value}`: the row spacing a band gap falls back to. */
  bandGapHint?: Label;
  /** Shown under "Gap before band" for the first band, where the gap is not used. */
  bandGapFirst?: Label;
  /** `{value}`: the band value a section field inherits. */
  fromBand?: Label;
  /** `{value}`: resets a section field to the band value. */
  resetToBandValue?: Label;
  /** Secondary text under the short code of a seat type. */
  seatTypeIdHint?: Label;
  /** `{value}`: one-click fix of a hall that is too shallow. */
  fixDepth?: Label;
  /** `{value}`: one-click fix of a hall that is too narrow. */
  fixWidth?: Label;
  /** `{value}`: notice after a new row of sections made the hall deeper. */
  bandAddedGrown?: Label;
  /** `{band}`, `{section}`: where an issue is, in the issue list. */
  issuePlace?: Label;
  // multi-level halls (balconies); optional so older complete label objects keep compiling
  /** Library template `balcony`. */
  templateBalcony?: Label;
  /** Switch in the band panel that lifts the band above the bands in front (a balcony). */
  bandUpperLevel?: Label;
  /** Help under the upper-level switch. */
  bandUpperLevelHint?: Label;
  /** Shown instead of the switch help on the first band, which is always on the ground floor. */
  bandUpperLevelFirst?: Label;
  /** Unit after "Starts at": the distance is measured from the screen. */
  unitFromScreen?: Label;
  /** Help under "Starts at" of an upper-level band. */
  bandStartDistanceHint?: Label;
  /** `{value}`: the lowest floor height that leaves `{clearance}` m of headroom under the band. */
  bandElevationHint?: Label;
  /** `{level}`: badge of an upper-level band on the plan. */
  planLevelBadge?: Label;
  /** Accessible name of the level filter of the plan. */
  levelFilterAria?: Label;
  /** Level filter: every level. */
  levelAll?: Label;
  /** Level filter: the ground floor. */
  levelGround?: Label;
  /** `{level}`: level filter, an upper level. */
  levelUpper?: Label;
  /** Plan hint of a hall with more than one level. */
  levelHint?: Label;
  /** Name of a band or section with the id `balcony`. */
  balconyName?: Label;
  /** Name of a band with the id `stalls` (the ground floor in front of a balcony). */
  stallsName?: Label;
  /** Name of a band with the id `lounge` (premium recliner rows). */
  loungeName?: Label;
  /** Plan legend of a multi-level hall: how the ground floor is drawn. */
  levelLegendGround?: Label;
  /** Plan legend of a multi-level hall: how a balcony is drawn. */
  levelLegendUpper?: Label;
}

/** Complete English constructor labels. */
export const editorLabelsEn: Required<EditorLabels> = {
  hallDimensions: 'Hall {width}×{depth}×{height} m',
  screenDimensions: 'Screen {width}×{height} m',
  advanced: 'Advanced',
  inspectorAria: 'Object settings',
  planAria: 'Hall plan',
  summary: 'Hall overview',
  selectHint: 'Click a section, screen or wall to change it',
  planHint: 'Click to edit · scroll to zoom · drag to pan',
  fit: 'Fit hall',
  exportAction: 'Export',
  sectionTitle: 'Section “{name}”',
  bandCanvas: 'Band {number} · {name}',
  addRight: '+ Section to the right',
  addBand: '+ Row of sections',
  seatPrice: 'Seat price',
  seatTypesPrices: 'Seats and prices',
  editTypes: 'Edit types…',
  sharedPrice: 'Shared by sections using “{name}”',
  excludeMode: 'Remove seats',
  excludeHint: 'Click a seat to remove or restore it',
  seatAction: 'Seat {key}',
  seatCount: '{count} seats',
  revenue: 'Maximum per session',
  priceMissing: 'Set prices for every type',
  closeInspector: 'Hall overview',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  /** English uses "error" for one and "errors" otherwise. */
  errorCount: (p) => (Number(p.count) === 1 ? '1 error' : `${p.count} errors`),
  centreName: 'Centre',
  leftName: 'Left',
  rightName: 'Right',
  mainName: 'Main hall',
  reclinerName: 'Recliners',
  standardName: 'Standard',
  unavailableType: 'This type is used in the hall. Change its sections to another type first.',
  emptyBand: 'No sections',
  seatsBooked: 'Booked seats: {keys}',
  title: 'Hall constructor',
  templates: 'Template',
  templatesAria: 'Templates',
  importAction: 'Import',
  importTitle: 'Import YAML or JSON',
  importHint:
    'Paste the text or choose a .yaml, .yml or .json file. The hall changes only after you press Import.',
  importFile: 'Choose file',
  importApply: 'Import',
  importDone: 'Imported',
  cancel: 'Cancel',
  position: 'Line {line}, column {col}',
  download: 'Download YAML',
  copy: 'Copy YAML',
  copied: 'YAML copied',
  copyFailed: 'Could not copy. Select the text and copy it by hand.',
  undo: 'Undo',
  redo: 'Redo',
  unsaved: 'Unsaved changes',
  readOnly: 'Read-only',
  rejected: 'The change was not applied: {reason}',
  notFound: 'Item “{id}” no longer exists',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveBlocked: 'Fix the errors to save.',
  saveInvalid: 'The server rejected the hall. Check the issues below.',
  saveConflict: 'The hall was changed on the server while you were editing.',
  loadServer: 'Load server version',
  saveInUse: 'Some seats already have bookings. They are highlighted in the preview.',
  saveError: 'Save failed: {message}',
  formAria: 'Hall settings',
  previewAria: 'Hall preview',
  tabsAria: 'Editor panels',
  tabForm: 'Settings',
  tabPreview: 'Preview',
  view3d: '3D',
  viewMap: '2D',
  viewSplit: 'Split',
  issuesTitle: 'Issues',
  noIssues: 'No issues. The hall is valid.',
  errorsGroup: 'Errors ({count})',
  warningsGroup: 'Warnings ({count})',
  sectionHall: 'Hall',
  sectionScreen: 'Screen',
  sectionSeatTypes: 'Seat types',
  sectionBands: 'Bands and sections',
  sectionConstraints: 'Constraints',
  sectionZones: 'Viewing zones',
  sectionExtra: 'Extra fields',
  name: 'Name',
  hallWidth: 'Width',
  hallDepth: 'Depth',
  hallHeight: 'Height',
  wallColor: 'Wall colour',
  floorColor: 'Floor colour',
  screenWidth: 'Width',
  screenHeight: 'Height',
  screenElevation: 'Bottom edge above floor',
  screenCurvature: 'Curvature',
  unitMetres: 'm',
  unitDegrees: '°',
  colorPicker: 'Pick colour',
  seatTypeAdd: 'Add seat type',
  seatTypeId: 'Short code',
  seatTypeLabel: 'Label',
  seatTypeWidth: 'Seat width',
  seatTypeDepth: 'Seat depth',
  seatTypeColor: 'Colour',
  newSeatType: 'New seat type',
  removeNamed: 'Remove {name}',
  firstRowDistance: 'Screen to first row',
  rowLabels: 'Row labels',
  rowLabelsAlphabetic: 'A, B, C…',
  rowLabelsNumeric: '1, 2, 3…',
  rowLabelsCustom: 'Custom list (edit in YAML)',
  seatNumbering: 'Seat numbering',
  numberingContinuous: 'Continuous along the row',
  numberingPerSection: 'Restart in each section',
  eyeHeight: 'Eye height',
  bandAdd: 'Add band',
  bandTitle: 'Band {id}',
  bandGapBefore: 'Gap before band',
  bandRiser: 'Riser per row',
  bandLabel: 'Name',
  bandStartDistance: 'Starts at',
  bandElevation: 'Floor height',
  bandPlacementHint: 'Leave empty to place the band right after the band in front of it.',
  sectionGapHint: '0 m: this section touches the one on its left. Type a width to add an aisle.',
  bandDefaults: 'Defaults for the band',
  sectionAdd: 'Add section',
  sectionId: 'Id',
  sectionSeats: 'Seats per row',
  sectionGap: 'Aisle before this section',
  sectionRows: 'Rows',
  sectionRowSpacing: 'Row spacing',
  sectionSeatPitch: 'Seat pitch',
  sectionSeatType: 'Seat type',
  sectionPriceTier: 'Price tier',
  sectionColor: 'Colour override',
  sectionExclude: 'Excluded seats',
  sectionExcludeHint: 'Comma-separated, for example r1.s1, r2.s4',
  inheritedValue: 'Same as band ({value})',
  none: 'None',
  resetToBand: 'Reset to band value',
  up: 'Up',
  down: 'Down',
  duplicate: 'Duplicate',
  remove: 'Remove',
  removeBand: 'Remove band',
  removesBand: 'This is the only section of its band, so the whole band is removed.',
  dismiss: 'Dismiss',
  generatedBand: 'Band {n}',
  generatedSection: 'Section {n}',
  issueField: '{field}: {message}',
  issueFitDepth: 'Does not fit in depth: needs {required} m, the hall is {available} m',
  issueMinBands: 'A hall needs at least one band',
  issueMinSections: 'A band needs at least one section',
  undoTip: 'Undo (Ctrl+Z)',
  redoTip: 'Redo (Ctrl+Shift+Z)',
  moveUpNamed: 'Move {name} up',
  moveDownNamed: 'Move {name} down',
  duplicateNamed: 'Duplicate {name}',
  cMinAisleWidth: 'Minimum aisle width',
  cMinWallClearance: 'Minimum clearance to walls',
  cMinRearClearance: 'Minimum clearance behind the last row',
  cMinLegroom: 'Minimum legroom',
  cMinHeadroom: 'Minimum headroom',
  cFirstRowRatio: 'First row distance to screen width',
  cMaxFrontAngle: 'Maximum angle to the top of the screen',
  cHeadAboveEye: 'Head height above eye level',
  cMinOverhangClearance: 'Minimum headroom under a balcony',
  cBalconySlabThickness: 'Balcony floor thickness',
  cBalconyParapetHeight: 'Balcony front wall height',
  zoneAdd: 'Add zone',
  zoneLabel: 'Label',
  zoneMinFov: 'Minimum field of view',
  newZone: 'New zone',
  extraEmpty: 'The host has not configured extra fields.',
  fieldNumber: 'Enter a number',
  fieldInteger: 'Enter a whole number',
  fieldRange: 'Allowed from {min} to {max}',
  fieldMin: 'At least {min}',
  fieldMax: 'At most {max}',
  fieldHex: 'Use the #RRGGBB format',
  locked: 'Locked by the edit policy',
  templateThreeSections: 'Three sections (concept)',
  templateSingle: 'Single block',
  templateStadium: 'Stadium',
  seatsRemoved: 'Seats in use that this edit removes: {keys}',
  seatsInUseCaption: 'Seats with bookings in the saved hall',
  showEditedHall: 'Show the edited hall',
  movedTo: '{name} is now at position {position} of {total}',
  dragHandle: 'Drag to reorder',
  allSaved: 'All changes saved',
  applied: 'Changed — not saved yet',
  bandGapHint: 'Leave empty to use the row spacing ({value} m).',
  bandGapFirst: 'Not used for the first row of sections: it starts at “Screen to first row”.',
  fromBand: 'Same as the band: {value}. Type a value to change it for this section only.',
  resetToBandValue: 'Use the band value ({value})',
  seatTypeIdHint:
    'The code of this seat type in hall files and price lists. You do not need to change it.',
  fixDepth: 'Make the hall {value} m deep',
  fixWidth: 'Make the hall {value} m wide',
  bandAddedGrown: 'The hall is now {value} m deep so the new row of sections fits.',
  issuePlace: '{band} › {section}',
  templateBalcony: 'Two levels: stalls + balcony',
  bandUpperLevel: 'Upper level (balcony) above the bands in front',
  bandUpperLevelHint:
    'Lifts this row of sections over the rear of the bands in front of it, like a balcony. A start and a floor height are suggested; you can change both.',
  bandUpperLevelFirst: 'The first row of sections is always on the ground floor.',
  unitFromScreen: 'm from the screen',
  bandStartDistanceHint:
    'Where its first row is. A smaller value moves the balcony forward, further over the seats below.',
  bandElevationHint:
    'Height of its first row above the hall floor. To leave {clearance} m of headroom for the seats below, use at least {value} m.',
  planLevelBadge: 'Balcony · level {level}',
  levelFilterAria: 'Show level',
  levelAll: 'All levels',
  levelGround: 'Ground floor',
  levelUpper: 'Level {level}',
  levelHint: 'Balconies cover the seats below them: choose “Ground floor” to edit those seats.',
  balconyName: 'Balcony',
  stallsName: 'Stalls',
  loungeName: 'Lounge',
  levelLegendGround: 'Solid: ground floor (stalls)',
  levelLegendUpper: 'Dashed: balcony above it',
};

/**
 * Reads a constructor label, with the built-in English text as the fallback for the keys that are
 * optional in `EditorLabels` (added after the first release) and not set.
 * @param editor The constructor labels in use.
 * @param key The optional label key.
 * @returns The label.
 */
export function editorLabel(editor: EditorLabels, key: keyof EditorLabels): Label {
  return (editor[key] ?? editorLabelsEn[key]) as Label;
}
