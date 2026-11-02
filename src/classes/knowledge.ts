import { HTTPService } from "../services/http.service.js";
import { KnowledgeResults, KnowledgeSearchOptions } from "../types/workspace.models.js";

/**
 * Knowledge search (MACHHUB 2): the passages of records and files that best
 * answer a question, in the collections whose fields are switched on for
 * Knowledge. Only collections the caller may view are searched.
 *
 * Needs MACHHUB 2 with the Knowledge module; otherwise it answers an error.
 */
export class Knowledge {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  async search(query: string, options: KnowledgeSearchOptions = {}): Promise<KnowledgeResults> {
    if (!query.trim()) throw new Error("A search needs a query.");
    const res = await this.httpService.request
      .withJSON({ query, ...options })
      .post<KnowledgeResults>("knowledge/search");
    return { ...res, hits: res?.hits ?? [] };
  }
}
