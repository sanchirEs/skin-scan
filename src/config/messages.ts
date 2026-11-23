// Every word the customer reads. Cosmetic language only: "signs of", never a diagnosis.
import type { Hint } from "@/lib/analysis/quality";
import type { SideHint, SideId } from "@/lib/analysis/sides";
import type { Level, MeasureId } from "@/lib/analysis/types";
import type { ToneCategory } from "@/lib/color/convert";
import type { AiConcernId } from "@/lib/ai/types";
import type { ConcernId, QuizAnswers, Slot } from "@/lib/rules/types";
import type { CameraProblemKind } from "@/lib/env/camera-support";

export const M = {
  band: { duration: "About 1 minute", steps: ["Scan", "Questions", "Reading", "Order"] },

  welcome: {
    title: "See what your skin is telling you",
    body: "Hold your phone at arm's length. We measure redness, evenness, dark circles and shine on your phone, and you can add an AI check for acne, wrinkles and pores.",
    facts: [
      "About a minute, start to finish",
      "Measured on your phone. Photos are never stored",
      "A morning and evening routine made for you",
    ],
    start: "Start skin check",
    notice: "We never store your photos. We save only anonymous numbers from each scan.",
    privacy: "How we handle your data",
  },

  tips: {
    aiNotice:
      "With the AI check, your front and side photos are sent securely to our AI partner to find acne, wrinkles and pores. We don't store them. Otherwise, the side photos are only used on this phone.",
    startAi: "Scan with AI check",
    startAiNote: "Adds acne, wrinkles and pores",
    startLocal: "Scan on this phone only",
    startLocalNote: "Photos never leave your phone",
    choose: "Choose your scan",
    title: "Before you scan",
    items: [
      "Take off makeup and glasses.",
      "Pull your hair back from your face.",
      "Face a window, or stay indoors out of direct sun.",
      "Turn your screen brightness all the way up. The screen lights your face.",
    ],
    start: "Open camera",
    back: "Back",
  },

  camera: {
    preparing: "Getting the camera ready",
    scanning: "Scanning, hold still",
    back: "Back",
    hints: {
      "no-face": "Bring your face into the oval",
      "one-face": "Only one face in the oval, please",
      closer: "Move a little closer",
      farther: "Move back a little",
      center: "Center your face in the oval",
      straight: "Look straight at the screen",
      "more-light": "Find more light, or face a window",
      "less-light": "Too bright. Step out of direct light",
      "even-light": "Turn so light falls evenly on both cheeks",
      "hold-still": "Hold still",
      ok: "Perfect. Hold still",
    } satisfies Record<Hint, string>,
    /** After the front photo: one photo turned to each side. */
    sides: {
      prompts: {
        side1: "Now turn your head slowly to your left",
        side2: "Now turn slowly to your right",
      } satisfies Record<SideId, string>,
      hints: {
        hold: "Hold there",
        back: "Turn back a little",
      } satisfies Partial<Record<SideHint, string>>,
      skip: "Skip side photos",
    },
    problems: {
      denied: {
        title: "The camera is blocked",
        body: "Allow camera access for this site in your browser settings, then try again.",
      },
      "in-app": {
        title: "Open this page in your browser",
        body: "Apps like Instagram and Facebook can block the camera. Tap the menu, choose Open in browser, then start again.",
      },
      "no-camera": {
        title: "No front camera found",
        body: "This scan needs a front camera. Open this page on your phone.",
      },
      insecure: {
        title: "This page needs a secure link",
        body: "Open the https:// version of this page and try again.",
      },
      unknown: {
        title: "The camera did not start",
        body: "Close other apps that use the camera, then try again.",
      },
      model: {
        title: "The scan could not load",
        body: "Check your internet connection and try again.",
      },
    } satisfies Record<CameraProblemKind | "model", { title: string; body: string }>,
    retry: "Try again",
    copyLink: "Copy link",
    copied: "Link copied. Paste it in your browser",
  },

  analyzing: {
    title: "Reading your skin",
    body: "Measuring each zone of your face, right here on this phone.",
    retake: "Retake scan",
    retakeHint: "Face the light and fill the oval, then retake.",
    failures: {
      "no-face": "We couldn't find your face in the photo.",
      "too-few-pixels": "Part of your face was out of view.",
      overexposed: "The light on your cheeks was too bright to read.",
      underexposed: "The photo was too dark to read.",
    },
  },

  quiz: {
    progress: (n: number, total: number) => `Question ${n} of ${total}`,
    next: "Next",
    back: "Back",
    pickUpTo: "Pick up to two",
    questions: {
      feel: {
        title: "How does your skin feel by midday?",
        options: {
          oily: "Oily all over",
          "t-zone": "Oily on the forehead and nose only",
          normal: "Comfortable",
          dry: "Tight or dry",
        },
      },
      breakouts: {
        title: "How often do you get breakouts?",
        options: {
          rarely: "Rarely",
          sometimes: "Sometimes",
          often: "Often",
          painful: "Often, with painful deep spots",
        },
      },
      stinging: {
        title: "Do skincare products sting or make you red?",
        options: { no: "No", sometimes: "Sometimes", often: "Often" },
      },
      goals: {
        title: "What would you most like to improve?",
        options: {
          clear: "Clearer skin",
          even: "More even tone",
          calm: "Less redness",
          hydrate: "More hydration",
          firm: "Firmer skin, fewer lines",
          eyes: "Brighter eye area",
        },
      },
      age: {
        title: "How old are you?",
        options: { "<20": "Under 20", "20-29": "20 to 29", "30-39": "30 to 39", "40-49": "40 to 49", "50+": "50 or over" },
      },
      pregnant: {
        title: "Are you pregnant or breastfeeding?",
        hint: "Some ingredients aren't recommended then. This answer is never saved.",
        options: { yes: "Yes", no: "No", "prefer-not": "Prefer not to say" },
      },
      sun: {
        title: "How much time do you spend in the sun most days?",
        options: { little: "Very little", some: "Some", "a-lot": "A lot" },
      },
    } satisfies {
      [K in keyof QuizAnswers]: { title: string; hint?: string; options: Record<string, string> };
    },
  },

  report: {
    title: "Your skin reading",
    subtitle: "Tap a result to see what it means and where on your face it was read.",
    findingsTitle: "Your results",
    phoneTitle: "Measured on this phone",
    summary: (name: string, level: string) => `Your strongest sign: ${name.toLowerCase()}, ${level.toLowerCase()}.`,
    summaryCalm: "No strong signs in this scan.",
    balanced: "Balanced",
    zonesOn: "Show where",
    zonesOff: "Hide zones",
    levels: { none: "Not seen", mild: "Slight", moderate: "Noticeable", high: "Strong" } satisfies Record<Level, string>,
    measures: {
      redness: {
        name: "Redness",
        ends: ["Calm", "Red"],
        where: "Read on your cheeks and nose",
        say: {
          none: "No signs of redness on your cheeks or nose.",
          mild: "Slight signs of redness, mostly on the cheeks.",
          moderate: "Noticeable signs of redness on your cheeks and nose.",
          high: "Strong signs of redness across your cheeks and nose.",
        },
      },
      evenness: {
        name: "Even tone",
        ends: ["Even", "Uneven"],
        where: "Read on your cheeks and forehead",
        say: {
          none: "Your tone looks even, with no clear dark spots.",
          mild: "A few small darker spots or slight unevenness.",
          moderate: "Noticeable dark spots or patches of uneven tone.",
          high: "Many dark spots or strongly uneven patches.",
        },
      },
      darkCircles: {
        name: "Dark circles",
        ends: ["Bright", "Shadowed"],
        where: "Read under both eyes",
        say: {
          none: "Your under-eye area is as bright as your cheeks.",
          mild: "Slightly darker under the eyes than on the cheeks.",
          moderate: "Noticeably darker under the eyes.",
          high: "Much darker under the eyes than on the cheeks.",
        },
      },
      shine: {
        name: "Shine",
        ends: ["Matte", "Shiny"],
        where: "Read on your forehead and nose",
        say: {
          none: "Matte, with almost no shine on your forehead and nose.",
          mild: "A little shine on the forehead and nose.",
          moderate: "Noticeable shine on your forehead and nose.",
          high: "Strong shine across your forehead and nose.",
        },
      },
    } satisfies Record<MeasureId, { name: string; ends: [string, string]; where: string; say: Record<Level, string> }>,
    tone: {
      title: "Your skin tone",
      body: "Tone is not something to fix. It is shown only so you can see where you sit on the range.",
      names: {
        "very-light": "Very light",
        light: "Light",
        intermediate: "Medium",
        tan: "Tan",
        brown: "Brown",
        dark: "Deep",
      } satisfies Record<ToneCategory, string>,
    },
    fromAnswers: "From your answers",
    answersNote: "The camera can't measure these, so they come from what you told us.",
    nothingToOrder: "Nothing in our range fits this routine yet. Message us and we'll help you choose.",
    answersTitle: "What the camera can't see",
    routineTitle: "Your routine",
    morning: "Morning",
    evening: "Evening",
    emptySlot: "Nothing from our range here yet. Look for",
    forConcern: (c: string) => `For ${c.toLowerCase()}`,
    everyday: "Every day",
    sample: "Sample product",
    dermatologist:
      "Your reading suggests talking to a dermatologist. They can help with deep, painful spots or strong redness in ways skincare can't.",
    order: "Order these",
    orderSent: "Your order is sent. We'll call you to confirm.",
    retake: "Retake scan",
    disclaimer:
      "This is a cosmetic skin check, not medical advice. A phone camera can't see everything, and light changes the result.",
  },

  ai: {
    title: "AI check",
    subtitle: "Acne, wrinkles and pores, found by our AI partner.",
    pending: "Checking acne, wrinkles and pores. This takes a few seconds.",
    off: "You chose to scan on this phone only, so acne, wrinkles and pores were not checked.",
    failed: {
      no_face: "The AI check could not find your face clearly. Retake the scan to try again.",
      face_too_small: "Your face was too small or cut off for the AI check. Retake the scan a little closer.",
      too_dark: "The photo was too dark for the AI check. Retake it facing a window.",
      pose: "Your head was turned for the AI check. Retake it looking straight ahead.",
      image_too_small: "The photo was too small for the AI check. Retake the scan a little closer.",
      not_configured: "The AI check is not switched on yet. Your other results are below.",
      default: "The AI check is not available right now. Your other results are below.",
    } as Record<string, string>,
    skinAge: (age: number) => `AI estimate of skin age: ${age}`,
    mapOn: "Show the AI map",
    measures: {
      acne: {
        name: "Acne",
        ends: ["Clear", "Breakouts"],
        where: "The AI marks each spot it found on your photo",
        say: {
          none: "No signs of acne in this scan.",
          mild: "A few signs of acne or blemishes.",
          moderate: "Noticeable signs of acne in several places.",
          high: "Strong signs of acne across your face.",
        },
      },
      wrinkles: {
        name: "Wrinkles",
        ends: ["Smooth", "Lined"],
        where: "The AI marks the lines it found on your photo",
        say: {
          none: "No visible lines in this scan.",
          mild: "A few fine lines.",
          moderate: "Noticeable lines, for example on the forehead or around the eyes.",
          high: "Deep or many visible lines.",
        },
      },
      pores: {
        name: "Pores",
        ends: ["Fine", "Visible"],
        where: "The AI marks visible pores on your photo",
        say: {
          none: "Pores are hard to see in this scan.",
          mild: "Some visible pores, mostly on the nose and cheeks.",
          moderate: "Noticeably visible pores.",
          high: "Very visible pores across your face.",
        },
      },
      texture: {
        name: "Texture",
        ends: ["Smooth", "Uneven"],
        where: "The AI marks uneven areas on your photo",
        say: {
          none: "Your skin surface looks smooth.",
          mild: "A little unevenness in the skin surface.",
          moderate: "Noticeable bumps or roughness.",
          high: "Strong unevenness across the skin surface.",
        },
      },
    } as Partial<Record<AiConcernId, { name: string; ends: [string, string]; where: string; say: Record<Level, string> }>>,
    names: {
      acne: "Acne",
      wrinkles: "Wrinkles",
      pores: "Pores",
      texture: "Texture",
      spots: "Spots",
      redness: "Redness",
      oiliness: "Oiliness",
      darkCircles: "Dark circles",
      eyeBags: "Eye bags",
      moisture: "Dryness",
      radiance: "Dullness",
      firmness: "Firmness",
    } satisfies Record<AiConcernId, string>,
  },

  concerns: {
    oiliness: "Oiliness",
    breakouts: "Breakouts",
    redness: "Redness",
    uneven: "Uneven tone",
    darkCircles: "Dark circles",
    dryness: "Dryness",
    sensitivity: "Sensitivity",
    aging: "Fine lines and firmness",
  } satisfies Record<ConcernId, string>,

  slots: {
    "am-cleanser": "Cleanser",
    "am-serum": "Serum",
    "am-moisturizer": "Moisturizer",
    "am-sunscreen": "Sunscreen",
    "pm-cleanser": "Cleanser",
    "pm-treatment": "Treatment",
    "pm-moisturizer": "Moisturizer",
    eye: "Eye cream",
  } satisfies Record<Slot, string>,

  order: {
    title: "Order these",
    body: "Choose what you want. We'll call you to confirm before anything is sent.",
    remove: "Remove",
    addBack: "Add back",
    removed: "Removed",
    qty: "Quantity",
    less: "One less",
    more: "One more",
    detailsTitle: "Your details",
    name: "Name",
    phone: "Phone",
    phoneHelp: "We'll call this number to confirm.",
    address: "Address or city",
    optional: "optional",
    note: "Note",
    consent: (brand: string) => `Save my order and skin results so ${brand} can contact me.`,
    total: "Total",
    payLater: "You pay when we confirm, by cash on delivery or bank transfer.",
    submit: "Send order",
    sending: "Sending",
    errors: {
      name: "Enter your name.",
      phone: "Enter a phone number we can call.",
      consent: "Tick the box so we can contact you.",
      items: "Choose at least one product.",
      network: "Your order didn't send. Check your connection and tap Send order again.",
      server: "Your order didn't send. Tap Send order again, or message us.",
      rate: "Too many tries. Wait a minute, then tap Send order again.",
    },
    back: "Back to my reading",
  },

  done: {
    title: "Order sent",
    reference: (id: string) => `Reference ${id}`,
    nextTitle: "What happens next",
    next: [
      "We call you to confirm what you ordered.",
      "You pay by cash on delivery or bank transfer.",
      "Your products are delivered.",
    ],
    back: "Back to my reading",
  },
} as const;
