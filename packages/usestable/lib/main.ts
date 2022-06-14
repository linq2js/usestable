import {
  ClassAttributes,
  Component,
  createElement,
  FC,
  HTMLAttributes,
  memo,
  ReactHTML,
  useEffect,
  useState,
} from "react";

export type CompareFn<T = any> = (a: T, b: T) => boolean;

export type CompareOption<T = any> =
  | "strict"
  | "shallow"
  | "deep"
  | CompareFn<T>;

export type StableProps<T = any> =
  | "*"
  | (keyof T)[]
  | { [name in keyof T]: true | CompareOption<T[name]> };

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
  compare?: CompareOption;
}

export interface StatableFn {
  /**
   * create stable component from tag name
   */
  <P extends HTMLAttributes<T>, T extends HTMLElement>(
    type: keyof ReactHTML,
    options?: Options<(ClassAttributes<T> & P) | null>
  ): FC<(ClassAttributes<T> & P) | null>;

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

export interface CreatorBuilder extends Function {
  <T extends Record<string, any>, K>(props: () => T, options?: Options<T>): (
    param: K
  ) => T;
  <T extends Record<string, any>, K, TArgs extends any[]>(
    props: () => T,
    keySelector: (...args: TArgs) => K,
    options?: Options<T>
  ): (...args: TArgs) => T;
}

export interface UseStable extends Function {
  /**
   * create stable object
   */
  <T extends Record<string, any>>(values: T, options?: Options<T>): T;

  /**
   * create stable object with init function
   */
  <T extends Record<string, any>>(
    init: (
      create: <TT extends Record<string, any>>(
        key: any,
        props: TT,
        options?: Options<TT>
      ) => TT
    ) => T,
    update: Partial<T>,
    options?: Options<T>
  ): T;
}

const arraySliceMethod = [].slice;
const regexpExecMethod = /a/.exec;
const dateGetTimeMethod = new Date().getTime;

/**
 * perform comparison for 2 values. This compare function also handle Date and Regex comparisons
 * the date values are equal if their timestamps (a value return from getTime() method) are equal
 * the regex values are equal if their string values (a value return from toString() method) are equal
 * objectCompare will be called if both values are objects
 * @param a
 * @param b
 * @param objectCompare
 * @returns
 */
export const defaultEqual = (a: any, b: any, objectCompare?: CompareFn) => {
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

/**
 * perfrom shallow compare for 2 values. by default, shallowCompare uses defaultCompare to compare array items, object prop values
 * @param a
 * @param b
 * @param valueCompare
 * @returns
 */
export const shallowEqual = (
  a: any,
  b: any,
  valueCompare: CompareFn = defaultEqual
) => {
  const objectCompare = (a: any, b: any) => {
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
  return defaultEqual(a, b, objectCompare);
};

/**
 * peform deep comparison for 2 values
 * @param a
 * @param b
 * @returns
 */
export const deepEqual = (a: any, b: any) => {
  return shallowEqual(a, b, deepEqual);
};

/**
 * check a value is whether promise object or not
 * @param value
 * @returns
 */
export const isPromiseLike = (value: any): value is Promise<any> => {
  return value && typeof value.then === "function";
};

const getStableMeta = (
  fn: Function
): { getCurrent: () => Function; proxy: any } | undefined => {
  return (fn as any).stableProxy;
};

const createStableFunction = (getCurrent: () => Function, proxy: any) => {
  return Object.assign(
    (...args: any[]) => {
      const current = getCurrent();
      const result = current.apply(proxy, args);
      if (process.env.NODE_ENV !== "production" && isPromiseLike(result)) {
        console.warn(
          "Becareful to use async stable function. You should use: const stable = useStable({ value }); const callback = useCallback(() => stable.value, [stable])"
        );
      }
      return result;
    },
    { stableMeta: { proxy, getCurrent } }
  );
};

const createCompareFn = (option?: CompareOption) => {
  if (typeof option === "function") return option;

  return option === "deep"
    ? deepEqual
    : option === "shallow"
    ? shallowEqual
    : defaultEqual;
};

const createComparerFactory = (props: StableProps, mode?: CompareOption) => {
  const comparer = createCompareFn(mode);
  if (props === "*") {
    return () => comparer;
  }
  if (Array.isArray(props))
    return (p: any) => (props.includes(p) ? comparer : undefined);
  return (p: any) => {
    const mode = props[p];
    return createCompareFn(mode === true ? "strict" : mode);
  };
};

const createStableObject = (isReactProps = false) => {
  type Refs = {
    object: Record<string | symbol, any>;
    getCompareFnFromProp: ReturnType<typeof createComparerFactory>;
    options: Options;
  };

  let cachedPropNames: string[] | undefined;
  const refs: Refs = {
    getCompareFnFromProp: createComparerFactory("*"),
    options: { props: "*" },
    object: {},
  };
  const cache = new Map<any, any>();
  const proxy = new Proxy(
    {},
    {
      set(_, p, value) {
        if (!(p in refs.object)) {
          throw new Error(`Unknown prop ${p.toString()}`);
        }
        if (typeof value === "function") {
          const meta = getStableMeta(value);
          // is stable function
          if (meta) {
            refs.object[p] = meta.getCurrent();
          } else {
            refs.object[p] = value;
          }
        } else {
          refs.object[p] = value;
        }
        return true;
      },
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

        const compareFn = refs.getCompareFnFromProp(p);

        if (!compareFn) return currentValue;

        let cachedValue = cache.get(p);

        // hanlde stable function
        if (typeof currentValue === "function") {
          // create stable function if cacheValue is not function
          if (typeof cachedValue !== "function") {
            cachedValue = createStableFunction(() => refs.object[p], proxy);
            cache.set(p, cachedValue);
          }
          return cachedValue;
        }

        // other value types
        const isEqual = compareFn(cachedValue, currentValue);

        if (isEqual) return cachedValue;

        cache.set(p, currentValue);
        return currentValue;
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true };
      },
      ownKeys() {
        return cachedPropNames ?? (cachedPropNames = Object.keys(refs.object));
      },
    }
  );

  return {
    proxy,
    merge(object: any, options: Options = {}) {
      return this.update({ ...refs.object, ...object }, options);
    },
    update(object: any, { props = "*", compare }: Options = {}) {
      // remove cache
      cachedPropNames = undefined;
      Object.assign(refs, {
        object: { ...object },
        getComparer: createComparerFactory(props, compare),
        options: { props, deepCompare: deepEqual },
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
  const Memoized = typeof component === "string" ? component : memo(component);

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
  let initializer: Function | undefined;
  let object: any;
  let options: Options | undefined;
  const updated = useState(() => new Set<any>())[0];

  if (typeof args[0] === "function") {
    [initializer, object, options] = args;
  } else {
    [object, options] = args;
  }

  const stableObject = useState(() => {
    const so = createStableObject();
    if (initializer) {
      const nestedStableObjects = new Map();
      const initProps = initializer((key: any, props: any, options: any) => {
        let nestedStableObject = nestedStableObjects.get(key);
        if (!nestedStableObject) {
          nestedStableObject = createStableObject();
          nestedStableObjects.set(key, nestedStableObject);
        }
        if (!updated.has(nestedStableObject)) {
          updated.add(nestedStableObject);
          nestedStableObject.update(props, options);
        }
      });
      so.update(initProps, options);
    }
    return so;
  })[0];

  if (initializer) {
    stableObject.merge(object, options);
  } else {
    stableObject.update(object, options);
  }

  updated.clear();

  useEffect(() => {
    const { $mount, $unmount } = stableObject.proxy as any;
    $mount?.();
    return $unmount;
  }, [stableObject]);

  return stableObject.proxy;
};
