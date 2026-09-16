"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
  DayButton,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-transparent p-3 text-slate-900 [--cell-size:2.25rem] dark:text-slate-100 [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) cursor-pointer rounded-xl p-0 text-slate-600 hover:bg-crm-accent-muted hover:text-crm-accent-muted-foreground select-none aria-disabled:opacity-50 dark:text-slate-300",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) cursor-pointer rounded-xl p-0 text-slate-600 hover:bg-crm-accent-muted hover:text-crm-accent-muted-foreground select-none aria-disabled:opacity-50 dark:text-slate-300",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-xl border border-white/50 bg-white/50 shadow-xs has-focus:border-crm-accent has-focus:ring-[3px] has-focus:ring-crm-accent/40 dark:border-white/10 dark:bg-white/[.06]",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 bg-transparent opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-semibold capitalize text-slate-800 dark:text-slate-100",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-8 items-center gap-1 rounded-xl pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-slate-500",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 select-none rounded-md text-[0.75rem] font-medium capitalize text-slate-500 dark:text-slate-400",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "select-none text-[0.8rem] text-slate-500 dark:text-slate-400",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-xl",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-xl"
            : "[&:first-child[data-selected=true]_button]:rounded-l-xl",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-xl bg-crm-accent-muted",
          defaultClassNames.range_start
        ),
        range_middle: cn(
          "rounded-none bg-crm-accent-muted/70",
          defaultClassNames.range_middle
        ),
        range_end: cn(
          "rounded-r-xl bg-crm-accent-muted",
          defaultClassNames.range_end
        ),
        today: cn(
          "rounded-xl bg-crm-accent-muted text-crm-accent-muted-foreground data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-slate-400 aria-selected:text-slate-400 dark:text-slate-600 dark:aria-selected:text-slate-600",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-slate-400 opacity-40 dark:text-slate-600",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex aspect-square size-auto w-full min-w-(--cell-size) cursor-pointer flex-col gap-1 rounded-xl leading-none font-normal text-slate-800 hover:bg-white/70 hover:text-slate-950 dark:text-slate-100 dark:hover:bg-white/10 dark:hover:text-white",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-crm-accent group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-crm-accent/40",
        "data-[selected-single=true]:bg-crm-accent data-[selected-single=true]:text-crm-accent-foreground data-[selected-single=true]:hover:bg-crm-accent-hover",
        "data-[range-start=true]:rounded-l-xl data-[range-start=true]:rounded-r-md data-[range-start=true]:bg-crm-accent data-[range-start=true]:text-crm-accent-foreground data-[range-start=true]:hover:bg-crm-accent-hover",
        "data-[range-end=true]:rounded-l-md data-[range-end=true]:rounded-r-xl data-[range-end=true]:bg-crm-accent data-[range-end=true]:text-crm-accent-foreground data-[range-end=true]:hover:bg-crm-accent-hover",
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-crm-accent-muted data-[range-middle=true]:text-crm-accent-muted-foreground data-[range-middle=true]:hover:bg-crm-accent-muted",
        "[&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
