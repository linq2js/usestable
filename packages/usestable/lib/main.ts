import {
  Component,
  createElement,
  FC,
  ForwardedRef,
  forwardRef,
  memo,
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

export type ComponentProps<C> = C extends (props: infer TProps) => any
  ? TProps
  : C extends FC<infer TProps>
  ? TProps
  : C extends Component<infer TProps>
  ? TProps
  : never;

export interface StableFn {
  /**
   * create stable component with an options
   */
  <C, P extends ComponentProps<C>>(component: C, options?: Options<P>): FC<P>;
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

export type Stable<T extends Record<string, any>> = {
  [key in keyof Omit<T, "$extra">]: T[key];
} & (T extends {
  $extra: infer TExtra;
}
  ? TExtra extends Record<string, any>
    ? {
        [key in keyof TExtra]: TExtra[key] extends (...args: infer TArgs) => any
          ? (
              ...args: TArgs
            ) => TExtra["dispatch"] extends () => infer TResult ? TResult : any
          : never;
      }
    : {}
  : {});

export interface UseStable extends Function {
  /**
   * create stable object with init function
   */
  <T extends Record<string, any>>(
    init: (
      create: <S extends Record<string, any>>(
        key: any,
        props: S,
        options?: Options<S>
      ) => S
    ) => T,
    update: Partial<T>,
    options?: Options<T>
  ): Stable<T>;

  /**
   * create stable object
   */
  <T extends Record<string, any>>(values: T, options?: Options<T>): Stable<T>;
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
  const proxy: any = new Proxy(
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
        if (p === "$extra") return proxy;

        const getCurrent = () => {
          if (refs.object.$extra) {
            const extraValue = refs.object.$extra[p];
            if (typeof extraValue === "function") {
              const dispatch = refs.object.$extra.dispatch;
              // skip wrapping if calling dispatch function
              if (!dispatch || extraValue === dispatch) return extraValue;
              return (...args: any[]) => {
                return dispatch(extraValue(...args));
              };
            }
          }
          return refs.object[p];
        };
        const currentValue = getCurrent();

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
            cachedValue = createStableFunction(getCurrent, proxy);
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
export const stable: StableFn = (component: any, options?: Options): any => {
  const Memoized = typeof component === "string" ? component : memo(component);

  const Wrapper = (props: any, ref: any) => {
    const stableObject = useState(() => createStableObject(true))[0];
    stableObject.update({ ...props, ref }, options);
    return createElement(Memoized, stableObject.proxy);
  };

  return forwardRef(Wrapper);
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
        nestedStableObject.update(props, options);
      });
      so.update(initProps, options);
      const { $init } = so.proxy as any;
      $init?.();
    }
    return so;
  })[0];

  if (initializer) {
    stableObject.merge(object, options);
  } else {
    stableObject.update(object, options);
  }

  useEffect(() => {
    const { $mount, $unmount } = stableObject.proxy as any;
    $mount?.();
    return $unmount;
  }, [stableObject]);

  return stableObject.proxy;
};

export const withExtra = <TProps extends Record<string, any>, TResult = any>(
  props: TProps,
  invoker: (payload: any) => TResult
): (<TName extends keyof TProps>(
  name: TName,
  ...args: TProps[TName] extends (...args: infer TArgs) => any ? TArgs : []
) => TResult) => {
  return (name, ...args: any[]) => {
    return invoker(props[name](...args));
  };
};

/**
 * execute the callback once and return its result
 * @param callback
 * @returns
 */
export const useInit = <T>(callback: () => T) => {
  return useState(callback)[0];
};

export interface ComponentBuilder<C, O, P = O> {
  /**
   * create component prop with specified valid values
   * @param name
   * @param values
   */
  prop<TValue extends string>(
    name: keyof O,
    values: TValue[]
  ): ComponentBuilder<void, O, P & { [key in TValue]?: boolean }>;

  /**
   * apply memoizing for compound component
   * @param areEqual
   */
  memo(areEqual?: (prev: P, next: P) => boolean): this;

  /**
   * apply stabling for compound component
   * @param options
   */
  stable(options?: Options<P>): this;

  /**
   * create computed prop
   * @param name
   * @param compute
   */
  prop<TName extends string = string, TValue = unknown>(
    name: TName,
    compute: (value: TValue, props: P) => Partial<O>
  ): ComponentBuilder<
    void,
    O,
    P &
      // optional prop
      (TValue extends void
        ? { [key in TName]?: TValue }
        : { [key in TName]: TValue })
  >;

  map<TName extends keyof O, TValue = O[TName]>(
    name: TName,
    mapper: (value: TValue, props: P) => O[TName]
  ): ComponentBuilder<
    void,
    O,
    P &
      (TValue extends void
        ? { [key in TName]?: TValue }
        : { [key in TName]: TValue })
  >;

  /**
   * use renderFn to render compound component, the renderFn retrives compound component, input props, ref
   * @param renderFn
   */
  render<TNewProps = P, TRef = any>(
    renderFn: (
      component: FC<P>,
      props: TNewProps,
      ref: ForwardedRef<TRef>
    ) => any
  ): ComponentBuilder<void, O, TNewProps>;

  /**
   * use HOC
   * @param hoc
   * @param args
   */
  use<TNewProps = P, TArgs extends any[] = []>(
    hoc: (
      component: FC<P>,
      ...args: TArgs
    ) => Component<TNewProps> | FC<TNewProps>,
    ...args: TArgs
  ): ComponentBuilder<void, O, TNewProps>;

  /**
   * end  building process and return a component
   */
  end(): (C extends void ? FC<P> : C) & {
    /**
     * for typing only, DO NOT USE this for getting value
     */
    props: P;
  };
}

export type AnyComponent<P> = Component<P> | FC<P>;

/**
 * create a component with special props and HOC
 * @param component
 * @returns
 */
export const create = <C>(
  component: C
): C extends AnyComponent<infer P> ? ComponentBuilder<C, P, P> : never => {
  const singlePropMappings: Record<string, string> = {};
  const multiplePropMappings: Record<string, Function> = {};
  const hocs: Function[] = [];
  const mappers: Record<string, Function> = {};
  let hasMapper = false;
  let hasPropMap = false;

  const setProp = (
    inputProps: Record<string, any>,
    targetProps: Record<string, any>,
    name: string,
    value: any
  ) => {
    if (typeof targetProps[name] !== "undefined") return;
    const multiplePropMapping = multiplePropMappings[name];
    if (multiplePropMapping) {
      const newProps = multiplePropMapping(value, inputProps);
      Object.entries(newProps).forEach(([key, value]) => {
        setProp(inputProps, targetProps, key, value);
      });
    } else {
      const mapTo = singlePropMappings[name];
      if (mapTo) {
        value = name;
        name = mapTo;
      }
      const mapper = mappers[name];
      if (mapper) value = mapper(value, inputProps);
      targetProps[name] = value;
    }
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prop(name: string, values: string[] | Function) {
      if (Array.isArray(values)) {
        values.forEach((value) => (singlePropMappings[value] = name));
      } else {
        multiplePropMappings[name] = values;
      }
      hasPropMap = true;
      return this;
    },
    use(hoc: Function, ...args: any[]) {
      hocs.push((component: any) => hoc(component, ...args));
      return this;
    },
    render(renderFn: Function) {
      hocs.push((component: any) =>
        forwardRef((props, ref) => renderFn(component, props, ref))
      );
      return this;
    },
    map(name: string, mapper: Function) {
      mappers[name] = mapper;
      hasMapper = true;
      return this;
    },
    memo(areEqual: Function) {
      hocs.push((component: any) => memo(component, areEqual as any));
      return this;
    },
    stable(options: any) {
      hocs.push((component: any) => stable(component, options as any));
      return this;
    },
    end() {
      let CompoundComponent = forwardRef(
        (props: Record<string, unknown>, ref: unknown) => {
          const mappedProps: Record<string, unknown> = {};
          // optimize performance
          if (hasMapper || hasPropMap) {
            Object.entries(props).forEach(([key, value]) => {
              setProp(props, mappedProps, key, value);
            });
          } else {
            Object.assign(mappedProps, props);
          }

          if (ref) mappedProps["ref"] = ref;

          return createElement(component as any, mappedProps);
        }
      );

      if (hocs.length) {
        CompoundComponent = hocs.reduce(
          (prev, hoc) => hoc(prev),
          CompoundComponent
        ) as any;
      }

      return CompoundComponent;
    },
  } as any;
};
