import type { TicketTier } from '@jdm/shared/events';
import { createContext, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';

import type { OnOrderCreated, WizardAction, WizardState, WizardStepDefinition } from './types';

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT': {
      const { ticketIndex, stepIndex } = state.position;
      const updatedTickets = [...state.tickets];
      updatedTickets[ticketIndex] = {
        ...updatedTickets[ticketIndex],
        ...action.stepData,
      };

      const nextStepIndex = stepIndex + 1;

      if (nextStepIndex < state.steps.length) {
        return {
          ...state,
          tickets: updatedTickets,
          position: { ticketIndex, stepIndex: nextStepIndex },
        };
      }

      const nextTicketIndex = ticketIndex + 1;
      if (nextTicketIndex < state.quantity) {
        return {
          ...state,
          tickets: updatedTickets,
          position: { ticketIndex: nextTicketIndex, stepIndex: 0 },
        };
      }

      return {
        ...state,
        tickets: updatedTickets,
        reviewing: true,
      };
    }

    case 'BACK': {
      if (state.reviewing) {
        return {
          ...state,
          reviewing: false,
          position: {
            ticketIndex: state.quantity - 1,
            stepIndex: state.steps.length - 1,
          },
        };
      }

      const { ticketIndex, stepIndex } = state.position;

      if (stepIndex > 0) {
        return {
          ...state,
          position: { ticketIndex, stepIndex: stepIndex - 1 },
        };
      }

      if (ticketIndex > 0) {
        return {
          ...state,
          position: {
            ticketIndex: ticketIndex - 1,
            stepIndex: state.steps.length - 1,
          },
        };
      }

      return state;
    }

    case 'GO_TO_REVIEW':
      return { ...state, reviewing: true };

    case 'RESET':
      return {
        ...state,
        position: { ticketIndex: 0, stepIndex: 0 },
        tickets: Array.from({ length: state.quantity }, () => ({})),
        reviewing: false,
      };

    default:
      return state;
  }
}

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  isFirstStep: boolean;
  totalStepCount: number;
  currentGlobalStep: number;
  onOrderCreated: OnOrderCreated;
}

const WizardContext = createContext<WizardContextValue | null>(null);

interface WizardProviderProps {
  eventId: string;
  tier: TicketTier;
  quantity: number;
  steps: WizardStepDefinition[];
  onOrderCreated: OnOrderCreated;
  children: ReactNode;
}

export function WizardProvider({
  eventId,
  tier,
  quantity,
  steps,
  onOrderCreated,
  children,
}: WizardProviderProps) {
  const applicableSteps = useMemo(
    () => steps.filter((s) => !s.appliesTo || s.appliesTo({ tier })),
    [steps, tier],
  );

  const initialState: WizardState = useMemo(
    () => ({
      eventId,
      tier,
      quantity,
      steps: applicableSteps,
      position: { ticketIndex: 0, stepIndex: 0 },
      tickets: Array.from({ length: quantity }, () => ({})),
      reviewing: applicableSteps.length === 0,
    }),
    [eventId, tier, quantity, applicableSteps],
  );

  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const totalStepCount = applicableSteps.length * quantity + 1; // +1 for review
  const currentGlobalStep =
    state.position.ticketIndex * applicableSteps.length + state.position.stepIndex + 1;

  const isFirstStep = state.position.ticketIndex === 0 && state.position.stepIndex === 0;

  const value = useMemo(
    () => ({ state, dispatch, isFirstStep, totalStepCount, currentGlobalStep, onOrderCreated }),
    [state, dispatch, isFirstStep, totalStepCount, currentGlobalStep, onOrderCreated],
  );

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used within WizardProvider');
  return ctx;
}
