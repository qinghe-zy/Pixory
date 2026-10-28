import React, { createContext, useContext, useMemo } from 'react';
import { defaultWechatTheme, type ImThemeTokens } from './imTheme';

const ImThemeContext = createContext<ImThemeTokens>(defaultWechatTheme);

export interface ImThemeProviderProps {
  theme?: ImThemeTokens;
  children: React.ReactNode;
}

/**
 * IM 模式主题提供器
 *
 * 可在全局、页面级或局部注入自定义 Theme。
 * 所有子组件通过 useImTheme() 自动消费。
 */
export function ImThemeProvider({ theme, children }: ImThemeProviderProps) {
  const activeTheme = useMemo(() => theme ?? defaultWechatTheme, [theme]);

  return (
    <ImThemeContext.Provider value={activeTheme}>
      {children}
    </ImThemeContext.Provider>
  );
}

/**
 * 消费当前 IM 主题配置的 React Hook
 */
export function useImTheme(): ImThemeTokens {
  return useContext(ImThemeContext);
}
