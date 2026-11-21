"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useReducer, type ReactNode } from "react";
import { DEMO_ALLOWED } from "@/lib/demo";
import { readDataVariant } from "@/lib/dev/data-variant";
import { captureUtm } from "@/lib/utm";
import { OrderForm } from "../order/OrderForm";
import { Report } from "../report/Report";
import { DevDataToggle } from "../dev/DevDataToggle";
import { TopBand } from "../ui/TopBand";
import { Analyzing } from "./Analyzing";
import { Camera } from "./Camera";
import { FlowContext, flowReducer, initialFlow, type Step } from "./flow";
import { Quiz } from "./Quiz";
import { ThankYou } from "./ThankYou";
import { Tips } from "./Tips";
import { Welcome } from "./Welcome";

const SCREENS: Record<Step, () => ReactNode> = {
  welcome: () => <Welcome />,
  tips: () => <Tips />,
  camera: () => <Camera />,
  analyzing: () => <Analyzing />,
  quiz: () => <Quiz />,
  report: () => <Report />,
  order: () => <OrderForm />,
  done: () => <ThankYou />,
};

export function SkinCheckApp() {
  const [state, dispatch] = useReducer(flowReducer, initialFlow);
  const reduce = useReducedMotion();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    captureUtm(window.location.search);
    dispatch({
      type: "flags",
      demo: DEMO_ALLOWED && params.get("demo") === "1",
      debug: params.get("debug") === "1",
      data: readDataVariant(window.location.search),
    });
  }, []);

  // New screens start at the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const fullBleed = state.step === "camera";

  return (
    <FlowContext.Provider value={{ state, dispatch }}>
      {!fullBleed && <TopBand step={state.step} />}
      <main className="mx-auto w-full max-w-[560px] overflow-x-clip">
        <AnimatePresence mode="wait" initial={false} custom={state.dir}>
          <motion.div
            key={state.step}
            custom={state.dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: state.dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: state.dir * -28, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {SCREENS[state.step]()}
          </motion.div>
        </AnimatePresence>
      </main>
      {state.demo && <DevDataToggle />}
    </FlowContext.Provider>
  );
}
