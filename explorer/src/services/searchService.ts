import { createContext, Dispatch, SetStateAction, useContext } from "react";

export interface ISearchContextValue {
    currentSearchQuery: string;
    setCurrentSearchQuery: Dispatch<SetStateAction<string>>;
}

const GlobalSearchContext = createContext({} as ISearchContextValue);

export const useGlobalSearch = () => useContext(GlobalSearchContext);
export default GlobalSearchContext;