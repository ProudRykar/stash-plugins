interface PluginApiReact {
  createElement: typeof React.createElement;
  Fragment: typeof React.Fragment;
  useState: typeof React.useState;
  useEffect: typeof React.useEffect;
  useRef: typeof React.useRef;
  useCallback: typeof React.useCallback;
  useMemo: typeof React.useMemo;
}

interface PluginApiUtils {
  runPluginOperation: (operation: string, args?: Record<string, any>) => Promise<{
    ok: boolean;
    data?: any;
    error?: { code: string; message: string };
  }>;
  StashService: any;
}

interface PluginApiRegister {
  route: (path: string, component: any) => void;
}

interface PluginApiPatch {
  after: (componentName: string, wrapper: (OriginalComponent: any) => any) => void;
  before: (componentName: string, wrapper: (OriginalComponent: any) => any) => void;
  instead: (componentName: string, wrapper: (OriginalComponent: any) => any) => void;
}

interface PluginApi {
  React: PluginApiReact;
  utils: PluginApiUtils;
  register: PluginApiRegister;
  patch: PluginApiPatch;
}

interface Window {
  PluginApi: PluginApi;
}