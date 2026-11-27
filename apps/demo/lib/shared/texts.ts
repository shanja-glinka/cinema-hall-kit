/**
 * The demo's own texts (English). Texts with numbers or names are functions, so plurals and word
 * order stay in one place. Pure: safe for client and server files.
 */

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** All texts of the demo, by page or topic. */
export const t = {
  common: {
    allHalls: '← All halls',
    home: 'Home',
    networkError: 'Could not reach the server. Please try again.',
    showtimes: (count: number) => plural(count, 'showtime', 'showtimes'),
    seats: (count: number) => plural(count, 'seat', 'seats'),
    version: (rev: number) => `version ${rev}`,
    noShowtimes: 'No showtimes yet.',
    addShowtimes: 'Add showtimes',
    hallPlan: (name: string) => `${name} hall plan`,
    /** Name of an upper level on a small hall plan, when no band of that level is named. */
    planLevel: (level: number, upperLevels: number) =>
      upperLevels === 1 ? 'Balcony' : `Level ${level + 1}`,
    seatTypesAndPrices: 'Seat types and prices',
    createNewHall: 'Create a new hall',
  },
  home: {
    eyebrow: 'Cinema Hall Kit · demo',
    title: 'Your cinema halls',
    lede: 'Create a hall, add showtimes, and sell tickets. Start with a template or a copy of a sample hall; the sample halls stay as they are unless you choose to change them.',
    demoNote: 'Demo: data is kept until the demo server restarts.',
    created: (name: string, showtimes: number) =>
      `Hall “${name}” created with ${plural(showtimes, 'showtime', 'showtimes')}. It is highlighted below.`,
    renamed: (requested: string, id: string) =>
      `The file asked for the hall id “${requested}”, which another hall already uses, so this hall got its own id “${id}”.`,
    hallsTitle: 'Halls',
    devTitle: 'For developers',
    devBefore: 'This demo is built with',
    devCore: '(hall files, validation, layout) and',
    devReact: '(hall editor and seat picker). Hall files are YAML or JSON; you can',
    devImport: 'import one',
    devAfter:
      'and generate showtimes for it. The backend is an in-memory mock: halls keep versions, and each showtime stays on the hall version it was created with until it is moved.',
    sample: 'Sample',
    hallFacts: (seats: number, rev: number) => `${seats} seats · version ${rev}`,
    showtimesTitle: 'Showtimes',
    moreShowtimes: (count: number) => `More showtimes: ${count}`,
    versionNote: (oldRev: number, oldSeats: number | undefined, currentRev: number) =>
      `Showtimes marked “v${oldRev}” still use an older layout of this hall${
        oldSeats === undefined ? '' : ` (${oldSeats} seats)`
      }. The hall itself is on version ${currentRev}; open it in the editor to move them.`,
    manageShowtimes: 'Add or delete showtimes',
    editHall: 'Edit hall',
    copy: 'Copy',
    chipOlder: (rev: number) => `Uses version ${rev} of the hall layout`,
  },
  chooser: {
    fromTemplate: 'Start from a template',
    copyExisting: 'Or copy an existing hall',
    hallToCopy: 'Hall to copy',
    copyThisHall: 'Copy this hall',
    importQuestion: 'Have a hall file from another system?',
    importLink: 'Import a hall from a file',
  },
  templates: {
    single: {
      title: 'Single block',
      description: 'One block of rows without aisles. Good for a small hall.',
    },
    threeSections: {
      title: 'Three sections',
      description: 'A centre block with an aisle on each side, and lounge rows at the back.',
    },
    stadium: {
      title: 'Stadium',
      description: 'Front rows and a steeper block of premium seats behind them.',
    },
    balcony: {
      title: 'Two levels',
      description: 'A main floor and a balcony above the back rows.',
    },
  },
  constructorChooser: {
    title: 'Hall editor',
    lede: 'What would you like to do?',
    editTitle: 'Change an existing hall',
    hallFacts: (seats: number, showtimes: number, sample: boolean) =>
      ` · ${seats} seats · ${plural(showtimes, 'showtime', 'showtimes')}${sample ? ' · sample' : ''}`,
    originTemplate: (title: string) => `the “${title}” template`,
    originCopy: (name: string) => `a copy of “${name}”`,
    copyTooLargeTitle: 'This hall is too large to copy',
    copyTooLargeText: (name: string) =>
      `A copy of “${name}” gets a new name and description, and with them it would be larger than a hall may be. Make “${name}” a little smaller first (for example, shorten long descriptions or remove notes), then copy it again.`,
    copyTooLargeEdit: (name: string) => `Change “${name}”`,
  },
  editor: {
    hallType: 'Hall type',
    sampleBadge: 'Sample hall',
    hintNew: (origin: string) =>
      `A new hall, started from ${origin}. Saving creates it; no other hall changes.`,
    aTemplate: 'a template',
    hintSample:
      'This is a sample hall. When you save, you choose: keep the sample as it is and save your changes as a new hall, or update the sample.',
    hintShowtimes: (count: number) =>
      `This hall has ${plural(count, 'showtime', 'showtimes')}. Saving changes the hall for new showtimes; existing showtimes keep their layout until you move them.`,
    hintUpdate: 'Saving updates this hall.',
    saveAsNew: 'Save as new hall',
    saveAsNewTitle: 'Keep this hall as it is and save the current layout as a new hall',
    saveAsNewFailed: (reason: string) => `Could not save a new hall: ${reason}`,
    notSaved: 'Not saved: nothing was changed.',
    saveBusy: 'A save is still in progress. Wait a moment, then save again.',
    answerSaveQuestion: 'Answer the save question first: save as a new hall, update or cancel.',
    copyNotLoaded:
      'The new hall was saved, but this page could not open it. Reload the page before you save again.',
    draftTitle: 'Restore draft?',
    draftText: (when: string) => `An unsaved draft from ${when} is available.`,
    restore: 'Restore',
    discard: 'Discard',
    draftFailed:
      'The draft could not be restored because it does not match this hall. It has been deleted.',
    noShowtimesToBook: 'No showtimes yet, so there is nothing to book.',
    openShowtime: (count: number) => `Open a showtime (${count})`,
    dialogNewTitle: 'Save as a new hall',
    dialogChooseTitle: (name: string) => `How do you want to save “${name}”?`,
    dialogNewText: (name: string) =>
      `The current layout is saved as a separate hall. “${name}” stays as it is.`,
    dialogSampleText: (name: string, showtimes: number) =>
      `“${name}” is a sample hall${
        showtimes > 0 ? ` and ${plural(showtimes, 'showtime', 'showtimes')}` : ''
      }. Saving as a new hall keeps the sample as it is. Updating changes the sample for everyone who uses this demo.`,
    dialogShowtimesText: (name: string, showtimes: number) =>
      `“${name}” has ${plural(showtimes, 'showtime', 'showtimes')}. If you update it, the hall and its name change on the home page and new showtimes use the new layout. Existing showtimes keep their current layout until you move them, and sold or held seats are never taken away.`,
    newHallName: 'Name of the new hall',
    updateSample: 'Update the sample hall',
    updateHall: 'Update this hall',
    cancel: 'Cancel',
    created: (name: string) => `Hall “${name}” created`,
    changesSaved: 'Changes saved',
    savedVersion: (rev: number) => ` · version ${rev}`,
    unchanged: (name: string) => `“${name}” is unchanged.`,
    renamed: (requested: string, id: string) =>
      `The imported file named the hall id “${requested}”. New halls get their own id, so this hall was saved as “${id}” and no other hall changed.`,
    nextStepCreated: 'Next step: add showtimes, so tickets can be sold for this hall.',
    nextStepNoShowtimes: 'This hall has no showtimes yet. Add showtimes to sell tickets.',
    outdated: (outdated: number, total: number) =>
      `${outdated} of ${total} showtimes still use the previous layout.`,
    repinExplain:
      '“Move future showtimes” gives the new layout to showtimes that have not started yet. Tickets already sold or held are kept: a showtime stays on its current layout if the new layout removes a seat that is sold or held there. Showtimes that have started are not changed.',
    allUseVersion: (count: number) =>
      `All ${plural(count, 'showtime uses', 'showtimes use')} this version.`,
    moveFuture: 'Move future showtimes',
    allHalls: 'All halls',
    openBooking: 'Open booking for a showtime',
    repinMoved: (rev: number) => `Moved to version ${rev}: `,
    repinKept: (count: number) => `, kept on their layout: ${count}`,
    repinRetryLater:
      'These seats are only held for a while: holds end within 10 minutes. Then press “Move future showtimes” again.',
    repinUnchanged: (count: number) => `, unchanged: ${count}`,
    aShowtime: 'A showtime',
    repinRefused: (showtime: string, seats: string, more: number, count: number) =>
      `${showtime} stays on its current layout: the new layout removes ${
        count === 1 ? 'seat' : 'seats'
      } ${seats}${more > 0 ? ` and ${more} more` : ''}, which ${count === 1 ? 'is' : 'are'} sold or held there.`,
  },
  showtimeForm: {
    daysLegend: 'Days',
    oneDay: 'One day',
    severalDays: 'Several days',
    date: 'Date',
    fromDate: 'From date',
    throughDate: 'Through date',
    quickDays: 'Quick choice of the day',
    today: 'Today',
    tomorrow: 'Tomorrow',
    times: 'Showtime times',
    occupancy: 'Seats occupied, %',
    hint: 'Times are separated by commas, for example 12:00, 18:30. One showtime is created for every day and every time.',
    demoSimulation: 'Demo simulation: pretend ticket sales',
    demoSimulationText:
      'For trying out the demo only. Marks this share of seats as already sold, so the seat map does not start empty. Leave 0 for a real showtime.',
    formatLegend: 'Showtime format',
    format: (time: string) => `Format · ${time}`,
    pricesLegend: 'Showtime prices, if they differ from the hall prices',
    price: (label: string) => `Price · ${label}`,
    noPrice: 'no price',
    noTiers: 'Price fields appear after the hall passes the check.',
    plan: (count: number) => `Showtimes to create: ${count}`,
    planFirst: (day: string, time: string) => ` · first: ${day} · ${time}`,
  },
  addShowtimes: {
    title: (name: string) => `Showtimes · ${name}`,
    lede: (seats: number) =>
      `Pick the days and the times. Each new showtime uses the current layout of the hall (${seats} seats) and the hall prices, unless you set other prices below.`,
    noneAdded: 'No new showtimes',
    added: (count: number) => `${plural(count, 'showtime', 'showtimes')} added`,
    skipped: (count: number) =>
      `${count} of them already existed at the same day and time and were left as they are.`,
    openOne: 'Open one to sell tickets:',
    newTitle: 'New showtimes',
    enterTime: 'Enter at least one time.',
    adding: 'Adding…',
    existingTitle: 'Showtimes of this hall',
    deleteShowtime: 'Delete',
    deleteShowtimeAria: (showtime: string) => `Delete the showtime ${showtime}`,
    deleteConfirm: (showtime: string) => `Delete the showtime ${showtime}? This cannot be undone.`,
    deleteYes: 'Yes, delete',
    deleteNo: 'Keep it',
    deleting: 'Deleting…',
    deleted: (showtime: string) => `Showtime ${showtime} deleted.`,
  },
  importPage: {
    title: 'Import a hall from a file',
    lede: 'Use this page when you already have a hall file (YAML or JSON), for example from another system. The hall is checked as soon as you add the file. To draw a hall yourself, go back and choose “Create a new hall” instead.',
    fileTitle: '1. Hall file',
    fileInput: 'Hall configuration file',
    drop: 'Drop a file here or choose one',
    dropHint: '.yaml, .yml or .json, up to 256 KB',
    sizeNote:
      'Hall text: up to 256 KB. The full request (JSON text and showtime settings) can be up to 576 KB.',
    tooLarge: (name: string) => `File “${name}” is larger than 256 KB and is not a hall config.`,
    notText: (name: string) => `File “${name}” is not a text file.`,
    loaded: (name: string) => `Loaded file “${name}”.`,
    paste: 'Or paste text',
    textLabel: 'Hall YAML',
    exampleName: 'My Hall',
    loadExample: 'Load example',
    exampleLoaded: (name: string) => `Example loaded: “${name}”.`,
    clear: 'Clear',
    previewTitle: '2. Check and preview',
    previewEmpty:
      'The result of the check and the hall plan will appear here. Start with the example if you are not sure where to begin.',
    rejected: (count: number) => `Hall rejected: ${count} errors`,
    passed: (name: string, seats: number) => `Hall “${name}” passed validation: ${seats} seats`,
    tier: 'Price tier',
    seats: 'Seats',
    price: 'Price',
    idNote: (requested: string, id: string) =>
      `A hall with the id “${requested}” already exists. The new hall will be saved as “${id}” (made from its name); the existing hall is not changed.`,
    warningsTitle: 'Warnings (do not prevent hall creation)',
    showtimesTitle: '3. Showtimes',
    showtimesText:
      'A showtime is created for every day and time in the range. Clear the times to create the hall without showtimes; you can add them later from the hall card. Prices have no currency; the demo shows the “¤” sign.',
    cinema: 'Cinema (optional)',
    noShowtimes: 'The hall will be created without showtimes.',
    serverRejected: (message: string) => `Server rejected the request: ${message}`,
    creating: 'Creating…',
    create: 'Create hall',
    fixErrors: 'Fix the errors before creating the hall.',
  },
  issues: {
    listLabel: 'Validation results',
    error: 'Error',
    warning: 'Warning',
    technical: 'Technical details',
    position: (line: number, column: number) => `line ${line}, column ${column}`,
    empty: 'Paste YAML or choose a file.',
    unreadable: 'Could not read the text.',
  },
  places: {
    hall: 'Hall size and colours',
    screen: 'Screen',
    seatTypes: 'Seat types',
    pricing: 'Prices',
    layout: 'Seating layout',
    constraints: 'Check thresholds',
    viewingZones: 'Viewing zones',
    meta: 'Extra fields',
    name: 'Hall name',
    id: 'Hall id',
    version: 'File format version',
    seatingArea: (index: number) => `Seating area ${index}`,
    section: (index: number) => `section ${index}`,
    seatType: (id: string) => `Seat type “${id}”`,
    fields: {
      width: 'width',
      depth: 'depth',
      height: 'height',
      elevation: 'height above the floor',
      curvature: 'curvature',
      rows: 'rows',
      seatsPerRow: 'seats per row',
      rowSpacing: 'row spacing',
      seatPitch: 'seat spacing',
      riserHeight: 'rise per row',
      gapBefore: 'gap before it',
      firstRowDistance: 'distance from the screen to the first row',
      eyeHeight: 'eye height',
      seatType: 'seat type',
      priceTier: 'price group',
      startDistance: 'distance from the screen',
      label: 'name',
    } as Record<string, string>,
  },
  booking: {
    /** The way back from a booking page, named after where it leads. */
    back: {
      home: 'All halls',
      showtimes: 'Showtimes of this hall',
      editor: 'Back to the hall editor',
      other: 'Back',
    },
    loading: 'Loading hall…',
    showtimesNav: 'Showtimes for this day',
    connectionLost: 'Connection lost. Retrying…',
    hallUpdated: 'Hall updated: this showtime moved to a new version.',
    dismiss: 'Dismiss',
    region: 'Booking',
    purchased: (ticket: string) => `Purchased · ticket № ${ticket}`,
    purchasedText: (seats: string) => `Seats ${seats}. Demo only: no payment was taken.`,
    expired: 'Hold expired',
    expiredText: 'The seats were released. Choose them again to buy tickets.',
    reserved: 'Seats reserved',
    reservedFor: (time: string) => `Seats reserved for ${time}`,
    reservedText:
      'Complete the purchase before the timer ends. Demo only: confirming takes no payment.',
    close: 'Close',
    noReservation: 'No reservation to confirm.',
    reserveWithHeld:
      'Some of these seats are already reserved for you. To buy them, keep only those seats selected. To reserve the other seats, deselect the reserved ones first.',
    purchaseSplit:
      'These seats were reserved separately, so they cannot be bought together. Keep only the seats of one reservation selected and confirm, then buy the others the same way.',
    purchaseExpired:
      'The 10 minutes to confirm have run out and the seats were released. Choose them again.',
    purchaseNotFound: 'These seats are no longer held for you. Choose them again.',
    purchaseClosed: 'This showtime does not exist any more.',
    purchaseBadRequest: 'The request was not understood.',
    purchaseSingleGap:
      'Buying only these seats would leave a single empty seat on its own. Change your selection so that no lone seat is left, then confirm again. Nothing was bought.',
    purchasePriceChanged: (total: string) =>
      `The price of these seats has changed since you saw it. The new total is ${total}. Check it, then confirm again. Nothing was bought.`,
    /** Seats of the selection that have no price at this showtime (labels, `F10`): confirming is off. */
    priceUnavailable: (seats: readonly string[]) =>
      seats.length === 1
        ? `Seat ${seats[0]} has no price at this showtime, so it cannot be bought. Deselect it to buy the other seats.`
        : `Seats ${seats.join(', ')} have no price at this showtime, so they cannot be bought. Deselect them to buy the other seats.`,
    purchaseRuleBroken:
      'These seats cannot be bought together. Change your selection and confirm again. Nothing was bought.',
    purchaseUnknown:
      'The connection was lost before the cinema answered. If the seats were bought, your ticket appears here as soon as the connection is back. If not, confirm again: nothing is ever bought twice.',
    /** The picker's button: it reserves the seats for 10 minutes; buying comes after. */
    reserveButton: 'Reserve seats · {price}',
  },
  generator: {
    required: 'Showtime details are required.',
    startDate: 'Enter a start date.',
    endDate: 'Enter an end date.',
    startPassed: 'The start date has already passed.',
    endBeforeStart: 'The end date is before the start date.',
    rangeTooLong: (days: number) => `The date range cannot exceed ${days} days.`,
    tooMany: (limit: number, count: number) =>
      `Create no more than ${limit} showtimes at once; this range has ${count}.`,
    occupancy: 'Occupancy must be a whole number from 0 to 100.',
    noTimes: 'Enter at least one showtime.',
    tooManyTimes: (limit: number) => `Enter no more than ${limit} showtimes per day.`,
    invalidShowtime: 'Invalid showtime.',
    timeNotText: 'Showtime must be a string in the form 18:30.',
    badTime: (value: string) => `“${value}” is not a valid time. Use HH:MM, for example 18:30.`,
    duplicateTime: (time: string) => `Time ${time} is listed more than once.`,
    badFormat: (time: string, limit: number) =>
      `Format for ${time} must be 1 to ${limit} characters, such as 2D or LUX.`,
    pricesFormat: 'Prices have an invalid format.',
    unknownTier: (tier: string) => `The hall has no “${tier}” price tier.`,
    badPrice: (label: string) =>
      `Price for “${label}” must be a non-negative number with at most two decimal places and no currency symbol.`,
  },
  server: {
    invalidName: (limit: number) => `Enter a hall name of 1 to ${limit} characters.`,
    invalidHall: 'The hall did not pass validation.',
    invalidCinema: (limit: number) => `Cinema name cannot exceed ${limit} characters.`,
    hallLimit: (limit: number) =>
      `The demo is limited to ${limit} halls. Restart the server to reset it.`,
    showtimeLimit: (limit: number) => `The demo is limited to ${limit} showtimes.`,
    hallShowtimeLimit: (limit: number) => `A hall can have no more than ${limit} showtimes.`,
    storeFailed: 'Could not store the hall.',
    buildFailed: 'Could not build the hall.',
    displayFailed: 'Could not display the hall.',
    hallNotFound: 'Hall not found.',
    noVersion: 'The hall has no readable version.',
    versionNotFound: 'That hall version does not exist.',
    yamlRequired: 'A yaml field with hall text is required.',
    showtimeNotFound: 'This showtime no longer exists.',
    showtimeHasHolds:
      'Seats of this showtime are temporarily reserved by a viewer who is buying tickets right now, so it cannot be deleted. Try again in about 10 minutes.',
    showtimeHasTickets:
      'Tickets have already been sold for this showtime, so it cannot be deleted.',
  },
};

export type Texts = typeof t;

/** BCP 47 locale for dates and prices. */
export const LOCALE = 'en-US';

/**
 * Starts the message of a purchase or reservation the server refused for a selection rule; the
 * violation code (`noSingleGap`, `max`, …) follows. The page turns it into a sentence.
 */
export const SELECTION_RULE_PREFIX = 'selection_rule:';
