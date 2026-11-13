import { createContext, useContext } from 'react';

export const CaptureContext = createContext<() => void>(() => {});

/** Opens the "Add a bill" sheet from anywhere inside the app shell. */
export const useCapture = () => useContext(CaptureContext);
