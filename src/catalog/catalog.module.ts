import { Global, Module } from "@nestjs/common";
import { CatalogController, CatalogService } from "./catalog.controller";

@Global()
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
