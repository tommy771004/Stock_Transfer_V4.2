import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSetting, setSetting } from '../services/api';

interface SettingsContextType {
  settings: Record<string, unknown>;
  updateSetting: (key: string, value: unknown) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const loadSettings = async () => {
      const keys = ['fontSize', 'compactMode', 'animationsOn', 'theme', 'language', 'sidebarDefaultState', 'defaultOrderQty', 'defaultOrderType', 'defaultPriceType', 'slippageTolerance', 'defaultBroker', 'defaultChartTimeframe', 'displayCurrency', 'defaultModel', 'systemInstruction'];
      // Parallel fetch — avoids 15 serial IPC round-trips in Electron mode
      const entries = await Promise.all(
        keys.map(async key => [key, await getSetting(key)] as const)
      );
      const loaded = Object.fromEntries(
        entries.filter(([, val]) => val !== null && val !== undefined)
      );
      setSettings(loaded);
    };
    loadSettings();
  }, []);

  const updateSetting = async (key: string, value: unknown) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      if (key === 'fontSize') {
        newSettings.compactMode = (value as string) === 'small';
      }
      return newSettings;
    });
    await setSetting(key, value);
    if (key === 'fontSize') {
      await setSetting('compactMode', (value as string) === 'small');
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
