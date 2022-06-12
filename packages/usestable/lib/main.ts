import { Component, createElement, FC, memo, useState } from "react";

export type Comparer = (a: any, b: any) => boolean;

export type CompareMode = "strict" | "shallow" | "deep";

export type StableProps<T = any> =
  | "*"
  | (keyof T)[]
  | { [name in keyof T]: true | CompareMode };

/**
 * Stable options
 */
export interface Options<P = any> {
  /**
   * indicate stable props of the component. all props = *
   * ```jsx
   * const MyButton = stable(ButtonImpl, { props: ['onClick', 'onDblClick'] });
   * ```
   */
  props?: StableProps<P>;
  compare?: CompareMode;
}

export interface StatableFn {
  /**
   * create stable component with an options
   */
  <
    C,
    P extends C extends FC<infer TProps>
      ? TProps
      : C extends Component<infer TProps>
      ? TProps
      : never
  >(
    component: C,
    options?: Options<P>
  ): FC<P>;
}

export interface UseStable extends Function {
  /**
   * create stable object
   */
  <T extends Record<string, any>>(
    values: T,
    options?: Omit<Options<T>, "props">
  ): T;

  /**
   * create stable object factory
   */
  <T extends Record<string, any>, K, F extends (key: K) => T>(
    factory: F,
    options?: Options<T>
  ): F;

  /**
   * create stable object factory
   */
  <
    T extends Record<string, any>,
    K,
    P extends any[],
    F extends (...args: P) => T
  >(
    factory: F,
    keySelector: (...args: P) => K,
    options?: Options<T>
  ): F;
}

const arraySliceMethod = [].slice;
const regexpExecMethod = /a/.exec;
const dateGetTimeMethod = new Date().getTime;
const defaultCompare = (a: any, b: any, objectCompare?: Comparer) => {
  if (a === b) return true;
  if (!a && b) return false;
  if (a && !b) return false;

  if (typeof a === "object" && typeof b === "object") {
    // detect date obj
    if (a.getTime === dateGetTimeMethod) {
      if (b.getTime === dateGetTimeMethod) return a.getTime() === b.getTime();
      return false;
    }
    // detect regex obj
    if (a.exec === regexpExecMethod) {
      if (b.exec === regexpExecMethod) return a.toString() === b.toString();
      return false;
    }
    if (objectCompare) return objectCompare(a, b);
  }

  return false;
};
const shallowCompare = (
  a: any,
  b: any,
  valueCompare: Comparer = defaultCompare
) => {
  if (a.slice === arraySliceMethod) {
    if (b.slice !== arraySliceMethod) return false;
    const length = a.length;
    if (length !== b.length) return false;
    for (let i = 0; i < length; i++) {
      if (!valueCompare(a[i], b[i])) return false;
    }
    return true;
  }

  const keys = new Set(Object.keys(a).concat(Object.keys(b)));

  for (const key of keys) {
    if (!valueCompare(a[key], b[key])) return false;
  }

  return true;
};
const deepCompare = (a: any, b: any) => {
  return defaultCompare(a, b, (a, b) => shallowCompare(a, b, deepCompare));
};

const createStableFunction = (getCurrent: () => Function) => {
  return (...args: any[]) => {
    const current = getCurrent();
    return current(...args);
  };
};

const createComparer = (mode?: CompareMode) => {
  return mode === "deep"
    ? deepCompare
    : mode === "shallow"
    ? shallowCompare
    : defaultCompare;
};

const createComparerFactory = (props: StableProps, mode?: CompareMode) => {
  const comparer = createComparer(mode);
  if (props === "*") {
    return () => comparer;
  }
  if (Array.isArray(props))
    return (p: any) => (props.includes(p) ? comparer : undefined);
  return (p: any) => {
    const mode = props[p];
    return createComparer(mode === true ? "strict" : mode);
  };
};

const createStableObject = (isReactProps = false) => {
  const refs: {
    object: any;
    getComparer: ReturnType<typeof createComparerFactory>;
    options: Options;
  } = {
    getComparer: createComparerFactory("*"),
    options: { props: "*" },
    object: {},
  };
  const cache = new Map<any, any>();
  const proxy = new Proxy(
    {},
    {
      get(_, p) {
        const currentValue = refs.object[p];
        if (isReactProps) {
          if (
            p === "key" ||
            p === "ref" ||
            // private/special prop
            (typeof p === "string" && p[0] === "_")
          )
            return currentValue;
        }

        const compare = refs.getComparer(p);

        if (!compare) return currentValue;

        let cachedValue = cache.get(p);

        // hanlde stable function
        if (typeof currentValue === "function") {
          // create stable function if cacheValue is not function
          if (typeof cachedValue !== "function") {
            cachedValue = createStableFunction(() => refs.object[p]);
            cache.set(p, cachedValue);
          }
          return cachedValue;
        }

        // other value types
        const isEqual = compare(cachedValue, currentValue);

        if (isEqual) return cachedValue;

        cache.set(p, currentValue);
        return currentValue;
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true };
      },
      ownKeys() {
        return Object.keys(refs.object);
      },
    }
  );

  return {
    proxy,
    update(object: any, { props = "*", compare }: Options = {}) {
      Object.assign(refs, {
        object,
        getComparer: createComparerFactory(props, compare),
        options: { props, deepCompare },
      });
    },
  };
};

const createStableObjectFactory = () => {
  const refs: {
    factory?: Function;
    keySelector?: Function;
    options: Options;
  } = { options: {} };
  const stableObjects = new Map<any, ReturnType<typeof createStableObject>>();
  const proxy = (...args: any[]) => {
    const key = refs.keySelector ? refs.keySelector(...args) : args[0];
    let so = stableObjects.get(key);
    if (!so) {
      so = createStableObject();
      stableObjects.set(key, so);
    }
    so.update(refs.factory?.(...args), refs.options);
    return so.proxy;
  };

  return {
    proxy,
    update(
      factory: Function,
      keySelector?: Function,
      { props = "*", compare }: Options = {}
    ) {
      Object.assign(refs, {
        factory,
        keySelector,
        options: { props, compare },
      });
    },
  };
};

/**
 * create stable component from input component
 * @param component
 * @param options
 * @returns
 */
export const stable: StatableFn = (component: any, options?: Options): any => {
  const Memoized = memo(component);
  Object.assign(Memoized, {
    displayName: component.name || component.displayName,
  });
  const Wrapper = (props: any) => {
    const stableObject = useState(() => createStableObject(true))[0];
    stableObject.update(props, options);
    return createElement(Memoized, stableObject.proxy);
  };
  return Wrapper;
};

/**
 * create stable object / factory
 * @param args
 * @returns
 */
export const useStable: UseStable = (...args: any[]): any => {
  let factory: Function | undefined;
  let keySelector: Function | undefined;
  let object: any;
  let options: Options | undefined;

  if (typeof args[0] === "function") {
    if (typeof args[1] === "function") {
      [factory, keySelector, options] = args;
    } else {
      [factory, options] = args;
    }
  } else {
    [object, options] = args;
  }

  const stableFactory = useState(() => {
    return factory ? createStableObjectFactory() : undefined;
  })[0];
  const stableObject = useState(() => {
    return !factory ? createStableObject() : undefined;
  })[0];

  if (stableFactory) {
    stableFactory.update(factory as Function, keySelector, options);
  }

  if (stableObject) {
    stableObject.update(object, options);
  }

  return stableFactory?.proxy ?? stableObject?.proxy;
};
