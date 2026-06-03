import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Home01Icon, UserGroupIcon, HierarchySquare01Icon, IdCardLanyardIcon } from "@hugeicons/core-free-icons"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "src/shared/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader className="border-b h-14 lg:h-[60px] flex justify-center px-4 lg:px-6">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-bold">YEC</span>
          </div>
          <span>YEC Lamphun</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive tooltip="หน้าหลัก">
                  <HugeiconsIcon icon={Home01Icon} size={20} />
                  <span>หน้าหลัก</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled tooltip="โครงสร้างองค์กร">
                  <HugeiconsIcon icon={HierarchySquare01Icon} size={20} />
                  <span>โครงสร้างองค์กร</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled tooltip="รายชื่อสมาชิก">
                  <HugeiconsIcon icon={UserGroupIcon} size={20} />
                  <span>รายชื่อสมาชิก</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled tooltip="ต่ออายุสมาชิก">
                  <HugeiconsIcon icon={IdCardLanyardIcon} size={20} />
                  <span>ต่ออายุสมาชิก</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
