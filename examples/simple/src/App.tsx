import { Component, Suspense } from 'solid-js';
import Comp from './Comp';

const App: Component = () => {
  return (
    <Suspense fallback={"Loading..."}>
      <Comp />
    </Suspense>
  );
};

export default App;
