import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/payment-processor/builders/base";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/payment-processor/build/utils";
import * as registry from "@/utils/royalties/registry";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        tokens.collection_id
      FROM tokens
      WHERE tokens.contract = $/contract/
        AND tokens.token_id = $/tokenId/
    `,
    {
      contract: toBuffer(options.contract!),
      tokenId: options.tokenId,
    }
  );

  if (!collectionResult) {
    throw new Error("Could not fetch token's collection");
  }

  const buildInfo = await utils.getBuildInfo(options, collectionResult.collection_id, "sell");
  if (!buildInfo) {
    throw new Error("Could not generate build info");
  }

  const builder: BaseBuilder = new Sdk.PaymentProcessor.Builders.SingleToken(config.chainId);

  const tokenRoyalties = await registry.getRegistryRoyalties(options.contract!, options.tokenId);
  const tokenRoyaltiesBPS = tokenRoyalties.map((r) => r.bps).reduce((a, b) => a + b, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).tokenId = options.tokenId;
  if (tokenRoyaltiesBPS > 0 && tokenRoyaltiesBPS != buildInfo.params.maxRoyaltyFeeNumerator) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).maxRoyaltyFeeNumerator = tokenRoyaltiesBPS;
  }

  return builder?.build(buildInfo.params);
};
