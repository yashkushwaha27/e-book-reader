declare module "page-flip" {
  export type PageFlipCorner = "top" | "bottom";

  export type PageFlipEventMap = {
    flip: (e: { data: number; object: PageFlip }) => void;
    init: (e: { data: { page: number; mode: string }; object: PageFlip }) => void;
  };

  export type PageFlipRect = {
    left: number;
    top: number;
    width: number;
    height: number;
    pageWidth: number;
  };

  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, unknown>);
    loadFromHTML(pages: HTMLElement[]): void;
    /** Recalculate layout from the container (matches library `PageFlip.update`). */
    update(): void;
    /** Replace HTML pages while keeping the current index (matches library `PageFlip.updateFromHtml`). */
    updateFromHtml(pages: HTMLElement[]): void;
    destroy(): void;
    flipNext(corner?: PageFlipCorner): void;
    flipPrev(corner?: PageFlipCorner): void;
    turnToNextPage(): void;
    turnToPrevPage(): void;
    turnToPage(index: number): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getRender(): { getRect(): PageFlipRect };
    on<K extends keyof PageFlipEventMap>(
      event: K,
      handler: PageFlipEventMap[K],
    ): this;
  }
}
