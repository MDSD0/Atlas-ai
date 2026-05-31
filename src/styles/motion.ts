import { type Transition } from "motion/react";

export const appleSpring: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 30,
  mass: 0.8
};
