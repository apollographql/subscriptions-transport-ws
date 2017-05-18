export const defineDeprecateFunctionWrapper = (deprecateMessage: string) => {
  const wrapperFunction = () => {
    if (process && process.env && process.env.NODE_ENV !== 'production') {
      console.warn(deprecateMessage);
    }
  };

  wrapperFunction();

  return wrapperFunction;
};
