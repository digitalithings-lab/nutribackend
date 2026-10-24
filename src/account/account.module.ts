import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller";
import { SupportController } from "./support.controller";

@Module({ controllers: [AccountController, SupportController] })
export class AccountModule {}
