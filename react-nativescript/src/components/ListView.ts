import * as React from "react";
import { ListViewProps } from "../shared/NativeScriptComponentTypings";
import { ListView as NativeScriptListView, ItemEventData, knownTemplates, ItemsSource } from "tns-core-modules/ui/list-view/list-view";
import { View, EventData } from "tns-core-modules/ui/core/view/view";
import { updateListener } from "../client/EventHandling";
import { Label } from "tns-core-modules/ui/label/label";
import { ContentView } from "tns-core-modules/ui/page/page";
import { getInstanceFromNode } from "../client/ComponentTree";
import { ListViewCell } from "./ListViewCell";

interface Props {
    items: ListViewProps["items"],
    cellFactory: (item: any, container: ContentView) => React.ReactElement,
    /* For now, we don't support custom onItemLoading event handlers. */
    // onItemLoading?: (args: ItemEventData) => void,
    onItemTap?: (args: ItemEventData) => void,
    onLoadMoreItems?: (args: EventData) => void,
    // TODO: support all the inherited props from the View component, i.e. listeners!
}

type NumberKey = number|string;

interface State {
    isItemsSource: boolean,
    nativeCells: Record<NumberKey, ContentView>;
    /* Native cells may be rotated e.g. what once displayed items[0] may now need to display items[38] */
    nativeCellToItemIndex: Map<ContentView, NumberKey>;
    itemIndexToNativeCell: Map<NumberKey, ContentView>;
}

export type ListViewComponentProps = Props & Partial<ListViewProps>;

/**
 * A React wrapper around the NativeScript ListView component.
 * Still under construction; needs to take React components as children.
 * https://docs.nativescript.org/ui/ns-ui-widgets/list-view
 * See: ui/list-view/list-view
 */
export class ListView extends React.Component<ListViewComponentProps, State> {
    private readonly myRef: React.RefObject<NativeScriptListView> = React.createRef<NativeScriptListView>();

    constructor(props: ListViewComponentProps){
        super(props);

        this.state = {
            isItemsSource: ListView.isItemsSource(props.items),
            nativeCells: {},
            nativeCellToItemIndex: new Map(),
            itemIndexToNativeCell: new Map()
        };
    }

    /* TODO: refer to: https://github.com/NativeScript/nativescript-sdk-examples-js/blob/master/app/ns-ui-widgets-category/list-view/code-behind/code-behind-ts-page.ts */
    private readonly defaultOnItemLoading: (args: ItemEventData) => void = (args: ItemEventData) => {
        let view: View|undefined = args.view;
        if(!view){
            const contentView = new ContentView();
            contentView.backgroundColor = "orange";
            args.view = contentView;

            console.log(`'onItemLoading': <empty> -> ${args.index}`);

            if(this.state.itemIndexToNativeCell.has(args.index)){
                console.warn(`WARNING: list index already registered yet args.view was falsy!`);
            }

            this.setState((prev: State) => {
                const nativeCellToItemIndex = new Map(prev.nativeCellToItemIndex);
                nativeCellToItemIndex.set(contentView, args.index);

                const itemIndexToNativeCell = new Map(prev.itemIndexToNativeCell);
                itemIndexToNativeCell.set(args.index, contentView);

                return {
                    ...prev,
                    nativeCells: {
                        ...prev.nativeCells,
                        [args.index]: contentView
                    },
                    nativeCellToItemIndex,
                    itemIndexToNativeCell
                };
            }, () => {
                console.log(`setState() completed for <empty> -> ${args.index}`);
            });
        } else {
            args.view.backgroundColor = "blue";
            // const filledIndices: string[] = Object.keys(this.state.nativeCells);
            // const sparseIndex: number|-1 = filledIndices.findIndex((index: string) => {
            //     return view === this.state.nativeCells[index];
            // });
            // const filledIndex: string|null = sparseIndex === -1 ? null : filledIndices[sparseIndex];
            // if(filledIndex === null){
            //     console.log(`Unable to find 'nativeCell' that args.view corresponds to!`, view);
            //     return;
            // }

            const itemIndexOfArgsView: NumberKey|undefined = this.state.nativeCellToItemIndex.get(view as ContentView);

            if(typeof itemIndexOfArgsView === "undefined"){
                console.warn(`Unable to find 'nativeCell' that args.view corresponds to!`, view);
                return;
            }

            // TODO: find using nativeCellToItemIndex rather than findIndex(); complexity goes from O(N) -> O(1).

            // setState() completed for <empty> -> 37
            // 'onItemLoading': 0 -> 38
            
            console.log(`'onItemLoading'! ${view} ${itemIndexOfArgsView} -> ${args.index}`);

            /* TODO: Not sure whether it's a no-op in truth. Have to re-examine. */
            // if(parseInt(itemIndexOfArgsView) === args.index){
            //     console.log(`Filled index matched args.index, so treating as no-op...`);
            //     return;
            // }

            // nativeCells[0] now needs to display props.items[38]

            this.setState((prev: State) => {
                const nativeCellToItemIndex = new Map(prev.nativeCellToItemIndex);
                const itemIndexToNativeCell = new Map(prev.itemIndexToNativeCell);

                // 'onItemLoading': 6 -> 5 (where 5 is already occupied by an incumbent view) may happen.
                const incumbentView: ContentView|undefined = itemIndexToNativeCell.get(args.index);
                if(incumbentView){
                    /* itemIndexToNativeCell will only show the latest native cell rendering each args.index */
                    itemIndexToNativeCell.delete(args.index);
                    /* nativeCellToItemIndex is permitted to have multiple views rendering the same args.index */
                    // nativeCellToItemIndex.delete(incumbentView as ContentView);
                }
                // nativeCellToItemIndex.delete(view as ContentView); /* redundant */
                nativeCellToItemIndex.set(view as ContentView, args.index);
                console.log(`PREV nativeCellToItemIndex:`, ListView.serialiseNativeCellToItemIndex(prev.nativeCellToItemIndex));
                console.log(`INCOMING nativeCellToItemIndex:`, ListView.serialiseNativeCellToItemIndex(nativeCellToItemIndex));

                itemIndexToNativeCell.delete(itemIndexOfArgsView);
                itemIndexToNativeCell.set(args.index, view as ContentView);

                console.log(`PREV itemIndexToNativeCell:`, ListView.serialiseItemIndexToNativeCell(prev.itemIndexToNativeCell));
                console.log(`INCOMING itemIndexToNativeCell:`, ListView.serialiseItemIndexToNativeCell(itemIndexToNativeCell));

                const nativeCells: Record<number, ContentView> = {
                    ...prev.nativeCells,
                    [args.index]: view as ContentView
                };

                /* TODO: nativeCells can be replaced with nativeCellToItemIndex... though it gives very nice logs */
                delete nativeCells[itemIndexOfArgsView];
                
                return {
                    nativeCells,
                    nativeCellToItemIndex,
                    itemIndexToNativeCell
                };
            }, () => {
                console.log(`setState() completed for ${itemIndexOfArgsView} -> ${args.index}`);
            });
        }
    }

    componentDidMount(){
        const node: NativeScriptListView|null = this.myRef.current;
        if(node){
            const { /* onItemLoading, */ onItemTap, onLoadMoreItems } = this.props;
            
            node.on(NativeScriptListView.itemLoadingEvent, this.defaultOnItemLoading);

            if(onItemTap){
                node.on(NativeScriptListView.itemTapEvent, onItemTap);
            }
            if(onLoadMoreItems){
                node.on(NativeScriptListView.loadMoreItemsEvent, onLoadMoreItems);
            }
        }
    }

    shouldComponentUpdate(nextProps: ListViewComponentProps, nextState: State): boolean {
        console.log(`[ListView] shouldComponentUpdate! nextState:`, Object.keys(nextState.nativeCells));
        console.log(`[ListView] shouldComponentUpdate! itemIndexToNativeCell:`, ListView.serialiseItemIndexToNativeCell(nextState.itemIndexToNativeCell));
        console.log(`[ListView] shouldComponentUpdate! nativeCellToItemIndex:`, ListView.serialiseNativeCellToItemIndex(nextState.nativeCellToItemIndex));

        // TODO: check whether this is the ideal lifecycle function to do this in.
        const node: NativeScriptListView|null = this.myRef.current;
        if(node){
            /* FIXME: evidently updateListener() isn't working as intended - it removes onItemTap even when it's no different to this.defaultOnItemLoading. */
            // updateListener(node, NativeScriptListView.itemLoadingEvent, this.defaultOnItemLoading, nextProps.onItemLoading);
            updateListener(node, NativeScriptListView.itemTapEvent, this.props.onItemTap, nextProps.onItemTap);
            updateListener(node, NativeScriptListView.loadMoreItemsEvent, this.props.onLoadMoreItems, nextProps.onLoadMoreItems);
        } else {
            console.warn(`React ref to NativeScript View lost, so unable to update event listeners.`);
        }
        return true;
    }

    componentWillUnmount(){
        const node: NativeScriptListView|null = this.myRef.current;

        console.log(`[ListView] componentWillUnmount!`);
        
        if(node){
            const { /* onItemLoading, */ onItemTap, onLoadMoreItems } = this.props;
            
            // if(onItemLoading){
            //     node.off(NativeScriptListView.itemLoadingEvent, onItemLoading || this.defaultOnItemLoading);
            // }

            node.off(NativeScriptListView.itemLoadingEvent, this.defaultOnItemLoading);

            if(onItemTap){
                node.off(NativeScriptListView.itemTapEvent, onItemTap);
            }
            if(onLoadMoreItems){
                node.off(NativeScriptListView.loadMoreItemsEvent, onLoadMoreItems);
            }
        }
    }

    static mapToKV<K, V>(map: Map<K, V>): [K, V][] {
        const arr: [K, V][] = [];
        map.forEach((value: V, key: K) => {
            arr.push([key, value]);
        });
        return arr;
    }

    static serialiseNativeCellToItemIndex<ContentView, NumberKey>(map: Map<ContentView, NumberKey>): Record<string, string> {
        return ListView.mapToKV(map).reduce((acc: Record<string, string>, [view, index], iterand: number) => {
            acc[`CV(${(view as any)._domId})`] = `args_${index}`;
            return acc;
        }, {});
    }

    static serialiseItemIndexToNativeCell<NumberKey, ContentView>(map: Map<NumberKey, ContentView>): Record<string, string> {
        return ListView.mapToKV(map).reduce((acc: Record<string, string>, [index, view]) => {
            // acc[`args[${index}]`] = `ContentView(${(view as any)._domId})`;
            acc[`args_${index}`] = `CV(${(view as any)._domId})`;
            return acc;
        }, {});
    }

    public static isItemsSource(arr: any[] | ItemsSource): arr is ItemsSource {
        // Same implementation as: https://github.com/NativeScript/NativeScript/blob/b436ecde3605b695a0ffa1757e38cc094e2fe311/tns-core-modules/ui/list-picker/list-picker-common.ts#L74
        return typeof (arr as ItemsSource).getItem === "function";
    }

    render(){
        const { children, items, ...rest } = this.props;
        console.warn("ListView implementation not yet complete!");
        if(children){
            console.warn("Ignoring 'children' prop on ListView; not yet supported");
        }

        const portals: React.ReactPortal[] = [];
        // this.state.itemIndexToNativeCell.forEach((view: ContentView, itemIndex: number) => {
        //     const item: any = this.state.isItemsSource ? (items as ItemsSource).getItem(itemIndex) : items[itemIndex];
        //     // console.log(`key: ${view._domId}`);
        //     const portal = ReactNativeScript.createPortal(
        //         React.createElement(
        //             "label",
        //             {
        //                 key: view._domId,
        //                 text: `item.text}`,
        //                 fontSize: 150,
        //                 height: 150,
        //                 // textWrap: true,
        //                 // class: "title"
        //             }
        //         ),
        //         view
        //     );
        //     portals.push(portal);
        // });

        console.log(`RENDERING nativeCellToItemIndex:`, ListView.serialiseNativeCellToItemIndex(this.state.nativeCellToItemIndex));
        this.state.nativeCellToItemIndex.forEach((itemIndex: number, view: ContentView) => {
            const item: any = this.state.isItemsSource ? (items as ItemsSource).getItem(itemIndex) : items[itemIndex];
            console.log(`CV(${view._domId}): ${item.text}`);
            // const portal = ReactNativeScript.createPortal(
            //     React.createElement(
            //         "label",
            //         {
            //             key: view._domId,
            //             text: `${item.text}`,
            //             fontSize: 150,
            //             height: 150,
            //             // textWrap: true,
            //             // class: "title"
            //         }
            //     ),
            //     view,
            //     `LVC(${view._domId})`
            // );
            const portal = React.createElement(
                ListViewCell,
                {
                    identifier: `Portal(${view._domId})`,
                    nativeElement: view,
                },
                this.props.cellFactory(item, view)
            )
            portals.push(portal as React.ReactPortal);
        });

        return React.createElement(
            'listView',
            {
                className: "list-group",
                /* Maybe we need to supply a template to map each item to a NativeScript View? */
                // itemTemplate: knownTemplates.itemTemplate,

                /* This seems to make the initial template; not too useful as it receives no args with which to customise it */
                // _itemTemplatesInternal: [{
                //     key: 'default',
                //     createView: (args: undefined) => {
                //         const label = new Label();
                //         label.text = "test";
                //         return label;
                //     }
                // }],

                ...rest,
                /* By passing 'items' into ListView, ListView automatically creates a list of labels where each text is simply a stringification of each item.
                 * Will have to figure out  */
                items,
                ref: this.myRef
            },
            React.createElement(
                "stackLayout",
                {
                    className: "list-group-item"
                },
                ...portals
                // ...Object.keys(this.state.nativeCells).map((index: string) => {
                //     const nativeCell: ContentView = this.state.nativeCells[index];
                //     return ReactNativeScript.createPortal(
                //         React.createElement(
                //             "label",
                //             {
                //                 key: `KEY-${(items as any[])[index]}`,
                //                 text: `Text: ${(items as any[])[index].text}`,
                //                 textWrap: true,
                //                 class: "title"
                //             }
                //         ),
                //         nativeCell
                //     );
                // })
            )
        );
    }
}
