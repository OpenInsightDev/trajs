"use client";

import { Avatar, AvatarFallback } from "@trajs/shadcn/avatar";
import { Badge } from "@trajs/shadcn/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@trajs/shadcn/sidebar";
import { SearchIcon } from "lucide-react";

/**
 * The sidebar, collapsed to the parts a page composes it from. The sidebar is a
 * client component — it reads the viewport width and holds its own open state —
 * so it is shown from a client demo rather than written into the page. The
 * `collapsible="none"` variant is the sidebar that is always open, which is
 * what a demo box can hold: the offcanvas one is fixed to the viewport, and
 * would leave the page it is shown on.
 */
export function SidebarDemo() {
  return (
    <SidebarProvider className="h-80 min-h-0 overflow-hidden rounded-lg border">
      <Sidebar collapsible="none">
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <Avatar size="sm">
              <AvatarFallback>BW</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium">trajs</span>
          </div>
          <SidebarInput placeholder="Search sessions…" />
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Sessions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="session_8f2a">
                    <SearchIcon />
                    <span>session_8f2a</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>18</SidebarMenuBadge>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton isActive href="#">
                        <span>turn 4</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton href="#">
                        <span>turn 5</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="session_31c7">
                    <SearchIcon />
                    <span>session_31c7</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>4</SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Badge variant="outline">2 sessions</Badge>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b p-2">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">a session, in the inset</span>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
