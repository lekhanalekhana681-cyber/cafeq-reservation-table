import "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

export default {
  async fetch(request: Request) {
    try {
      return new Response("Cafeq Server Running", {
        headers: { "content-type": "text/html" },
      });
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
