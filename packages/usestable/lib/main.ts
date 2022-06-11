import { Component, createElement, FC, memo, useRef, useState } from "react";

export interface Options<P = any> {
  props?: "*" | (keyof P)[];
  deepCompare?: number | true;
}

export interface StatableFn {
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

const strictCompare = Object.is;
const arraySliceMethod = [].slice;
const dateGetTimeMethod = new Date().getTime;
let deepCompare: (a: any, b: any, deep: number | true) => boolean;

const shallowCompare = (a: any, b: any, deep: number | true) => {
  const compare = deep ? deepCompare : strictCompare;
  const nextDeep = deep === true ? true : deep - 1;
  if (a.slice === arraySliceMethod) {
    if (b.slice !== arraySliceMethod) return false;
    const length = a.length;
    if (length !== b.length) return false;
    for (let i = 0; i < length; i++) {
      if (!compare(a[i], b[i], nextDeep)) return false;
    }
    return true;
  }

  const keys = new Set(Object.keys(a).concat(Object.keys(b)));

  for (const key of keys) {
    if (!compare(a[key], b[key], nextDeep)) return false;
  }

  return true;
};

deepCompare = (a: any, b: any, deep: number | boolean) => {
  if (a === b) return true;
  if (!a && b) return false;
  if (a && !b) return false;

  if (typeof a === "object" && typeof b === "object") {
    if (a.getTime === dateGetTimeMethod) {
      if (b.getTime === dateGetTimeMethod) return a.getTime() === b.getTime();
      return false;
    }
    if (deep) return shallowCompare(a, b, deep === true ? true : deep - 1);
    return false;
  }

  return false;
};

const createStableFunction = (getCurrent: () => Function) => {
  return (...args: any[]) => {
    const current = getCurrent();
    return current(...args);
  };
};

const createStableObject = () => {
  const refs: { object: any; options: Options } = {
    options: { props: "*" },
    object: {},
  };
  const cache = new Map<any, any>();
  const proxy = new Proxy(
    {},
    {
      get(_, p) {
        const isStableProp =
          refs.options.props === "*" || refs.options.props?.includes(p);
        const currentValue = refs.object[p];

        if (!isStableProp) return currentValue;

        let cachedValue = cache.get(p);

        if (typeof currentValue === "function") {
          if (!cachedValue || typeof cachedValue !== "function") {
            cachedValue = createStableFunction(() => refs.object[p]);
            cache.set(p, cachedValue);
          }
          return cachedValue;
        }

        if (
          deepCompare(cachedValue, currentValue, refs.options.deepCompare ?? 0)
        ) {
          return cachedValue;
        }
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
    update(object: any, { props = "*", deepCompare = 0 }: Options = {}) {
      Object.assign(refs, { object, options: { props, deepCompare } });
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
      { props = "*", deepCompare = 0 }: Options = {}
    ) {
      Object.assign(refs, {
        factory,
        keySelector,
        options: { props, deepCompare },
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
    const prevRef = useRef<{ result: any; props: any }>();
    const stableObject = useState(() => createStableObject())[0];
    stableObject.update(props);

    if (
      !prevRef.current ||
      !shallowCompare(
        prevRef.current.props,
        props,
        options?.deepCompare === true ? true : options?.deepCompare ?? 0
      )
    ) {
      const prevProps = { ...stableObject.proxy };
      prevRef.current = {
        props: prevProps,
        result: createElement(Memoized, prevProps),
      };
    }
    return prevRef.current.result;
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
