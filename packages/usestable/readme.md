- [`useStable`](#usestable)
  - [Installation](#installation)
  - [Motivation](#motivation)
  - [Recipes](#recipes)
    - [Stable identity callback](#stable-identity-callback)
    - [Stable component](#stable-component)
    - [Geting fresh values in callbacks](#geting-fresh-values-in-callbacks)
    - [Using stable object with other React hooks](#using-stable-object-with-other-react-hooks)
    - [Conditional callbacks](#conditional-callbacks)
  - [API reference](#api-reference)

# `useStable`

A React hook to create stable component/object

## Installation

**with NPM**

```bash
npm i usestable --save
```

**with YARN**

```bash
yarn add usestable
```

## Motivation

Inspired by [useEvent RFC](https://github.com/reactjs/rfcs/pull/220)

## Recipes

### Stable identity callback

**with useEvent**

```js
import { useEvent } from "react";

function Chat() {
  const [text, setText] = useState("");

  const onClick = useEvent(() => {
    sendMessage(text);
  });

  return <SendButton onClick={onClick} />;
}
```

**with useStable**

```js
import { useStable } from "react";

function Chat() {
  const [text, setText] = useState("");
  const stable = useStable({
    onClick: () => {
      sendMessage(text);
    },
  });

  return <SendButton onClick={stable.onClick} />;
}
```

### Stable component

For above examples, you must wrap your SendButton with memo(). Need to useEvent every time and easy to forget.
`usestable` provide stable() HOC to create a stable component on the fly

```js
import { stable } from "usestable";

const SendButton = stable((props) => {
  // implementation
});

// you also wrap 3rd-party components
import { Button } from "antd";

// even with specified props only. by default, all props will be stable
const SendButton = stable(Button, { props: ["onClick"] });
```

There you go, no need to wrap any event callbacks. You also free with inline callbacks

```js
function Chat({ rooms }) {
  const [text, setText] = useState("");

  return rooms.map((room) => (
    <SendButton
      // if you wrap SendButton with stable(), you dont not worry this
      onClick={
        () => sendMessage(room, text)
        // 🙁 Can't wrap it with useEvent
      }
    />
  ));
}
```

### Geting fresh values in callbacks

Sometimes, useEvent fails with async callback

**with useEvent**

```js
const contextVariable = useContext(SomeContext);
const callback = useEvent(async () => {
  // the contextVariable is fresh now
  console.log(contextVariable);
  await callAsyncMethod();
  // but it is outdated now
  console.log(contextVariable);
});
```

You must use more useEvent hook to handle above case

```js
const contextVariable = useContext(SomeContext);
const onDone = useEvent(() => {
  // do something with contextVariable
});
const callback = useEvent(async () => {
  // the contextVariable is fresh now
  console.log(contextVariable);
  await callAsyncMethod();
  onDone();
});
```

**with useStable #1**

```js
import { useStable } from "usestable";

const contextVariable = useContext(SomeContext);
// create stable object to hold contextVariable
const stable = useStable({ contextVariable });
const callback = useCallback(async () => {
  // the contextVariable is fresh now
  console.log(stable.contextVariable);
  await callAsyncMethod();
  // and it is still fresh now and after. Easy ?
  console.log(stable.contextVariable);
}, [stable]);
```

**with useStable #2**

```js
import { useStable } from "usestable";

const contextVariable = useContext(SomeContext);
// create stable object to hold contextVariable
const { callback } = useStable({
  // add contexture variables
  contextVariable,
  // define async callback
  async callback() {
    // using this object to access stable props
    // the contextVariable is fresh now
    console.log(this.contextVariable);
    await callAsyncMethod();
    // and it is still fresh now and after. Easy ?
    console.log(this.contextVariable);
  },
});
```

### Using stable object with other React hooks

You can use stable object with any React's hooks

```js
const stable = useStable({
  some,
  stable,
  variables,
  here,
  dateValue, // useStable will not update date values if its timestamp does not change
  stableCallback() {},
});

const flexibleCallback = useCallback(() => {
  console.log(unstableVar);
  console.log(stable.variables);
}, [stable, unstableVar /* add dependencies to control callback re-create */]);

useEffect(() => {
  socket.on("connected", () => {
    console.log(stable.some);
    console.log(stable.variables);
  });
}, [stable /* add more dependencies ad you need */]);
```

### Conditional callbacks

Sometimes React memo and useEvent fail with conditional callbacks

```js
function Chat({ onOdd, onEven }) {
  const [text, setText] = useState("");

  return <SendButton onClick={text.length % 2 ? onEven : onOdd} />;
}
```

You must add more useEvent hook to handle conditional callbacks

```js
function Chat({ onOdd, onEven }) {
  const [text, setText] = useState("");
  const onClick = useEvent(() => (text.length % 2 ? onEven() : onOdd()));

  return <SendButton onClick={onClick} />;
}
```

If SendButton already wrapped by stable() HOC, everything done without any effort

## API reference

https://linq2js.github.io/usestable/
