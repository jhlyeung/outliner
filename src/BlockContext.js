import React from 'react';

const BlockContext = React.createContext({});

export const BlockProvider = BlockContext.Provider;
export const BlockConsumer = BlockContext.Consumer;
export default BlockContext;
