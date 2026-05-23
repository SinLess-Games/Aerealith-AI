'use client';

import * as React from 'react';
import type { ReactNode } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import Box, { type BoxProps } from '@mui/material/Box';
import Dialog, { type DialogProps } from '@mui/material/Dialog';
import DialogActions, {
  type DialogActionsProps,
} from '@mui/material/DialogActions';
import DialogContent, {
  type DialogContentProps,
} from '@mui/material/DialogContent';
import DialogTitle, { type DialogTitleProps } from '@mui/material/DialogTitle';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import Stack, { type StackProps } from '@mui/material/Stack';
import Typography, {
  type TypographyProps,
} from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

import { mergeSx } from '../../utils';

export type PrimitiveModalCloseReason =
  | 'backdropClick'
  | 'escapeKeyDown'
  | 'closeButtonClick';

export type PrimitiveModalActionsAlign =
  | 'left'
  | 'center'
  | 'right'
  | 'space-between';

export type PrimitiveModalSlotProps = {
  title?: Omit<Partial<DialogTitleProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  header?: Omit<Partial<StackProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  headerText?: Omit<Partial<StackProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  titleText?: Omit<Partial<TypographyProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  description?: Omit<Partial<TypographyProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  customTitle?: Omit<Partial<BoxProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  customDescription?: Omit<Partial<BoxProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  closeButton?: Omit<Partial<IconButtonProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  content?: Omit<Partial<DialogContentProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
  actions?: Omit<Partial<DialogActionsProps>, 'children' | 'sx'> & {
    sx?: SxProps<Theme>;
  };
};

export type PrimitiveModalProps = {
  open: boolean;

  onClose: (reason?: PrimitiveModalCloseReason, event?: unknown) => void;

  onDialogClose?: DialogProps['onClose'];

  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;

  showCloseButton?: boolean;
  closeButtonLabel?: string;
  dividers?: boolean;

  closeOnBackdropClick?: boolean;
  closeOnEscapeKeyDown?: boolean;
  renderHeaderWhenEmpty?: boolean;

  actionsAlign?: PrimitiveModalActionsAlign;

  paperSx?: SxProps<Theme>;
  contentSx?: SxProps<Theme>;
  actionsSx?: SxProps<Theme>;
  titleSx?: SxProps<Theme>;

  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;

  'aria-labelledby'?: string;
  'aria-describedby'?: string;

  slotProps?: PrimitiveModalSlotProps;
} & Omit<
  DialogProps,
  | 'open'
  | 'onClose'
  | 'children'
  | 'title'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'slotProps'
>;

function getActionsJustifyContent(
  align: PrimitiveModalActionsAlign,
): SxProps<Theme> {
  switch (align) {
    case 'left':
      return {
        justifyContent: 'flex-start',
      };
    case 'center':
      return {
        justifyContent: 'center',
      };
    case 'space-between':
      return {
        justifyContent: 'space-between',
      };
    case 'right':
    default:
      return {
        justifyContent: 'flex-end',
      };
  }
}

function isTextNode(value: ReactNode): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

export function PrimitiveModal({
  open,
  onClose,
  onDialogClose,
  title,
  description,
  actions,
  children,
  showCloseButton = true,
  closeButtonLabel = 'Close modal',
  dividers = false,
  closeOnBackdropClick = true,
  closeOnEscapeKeyDown = true,
  renderHeaderWhenEmpty = false,
  actionsAlign = 'right',
  maxWidth = 'sm',
  fullWidth = true,
  scroll = 'paper',
  paperSx,
  contentSx,
  actionsSx,
  titleSx,
  PaperProps,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  'aria-labelledby': ariaLabelledByProp,
  'aria-describedby': ariaDescribedByProp,
  slotProps,
  ...dialogProps
}: PrimitiveModalProps): React.ReactElement {
  const generatedTitleId = React.useId();
  const generatedDescriptionId = React.useId();

  const hasTitle = Boolean(title);
  const hasDescription = Boolean(description);
  const hasActions = Boolean(actions);
  const hasHeader =
    hasTitle || hasDescription || (showCloseButton && renderHeaderWhenEmpty);

  const titleId =
    ariaLabelledByProp ??
    ariaLabelledBy ??
    (hasTitle ? generatedTitleId : undefined);

  const descriptionId =
    ariaDescribedByProp ??
    ariaDescribedBy ??
    (hasDescription ? generatedDescriptionId : undefined);

  const handleDialogClose: DialogProps['onClose'] = (event, reason) => {
    if (reason === 'backdropClick' && !closeOnBackdropClick) {
      return;
    }

    if (reason === 'escapeKeyDown' && !closeOnEscapeKeyDown) {
      return;
    }

    onDialogClose?.(event, reason);
    onClose(reason, event);
  };

  const handleCloseButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ): void => {
    onClose('closeButtonClick', event);
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      scroll={scroll}
      aria-label={ariaLabel}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      PaperProps={{
        ...PaperProps,
        sx: mergeSx(
          {
            borderRadius: { xs: 2.5, sm: 3 },
            backgroundImage: 'none',
            bgcolor: 'background.paper',
            boxShadow: 24,
            overflow: 'hidden',
          },
          PaperProps?.sx,
          paperSx,
        ),
      }}
      {...dialogProps}
    >
      {hasHeader ? (
        <DialogTitle
          id={hasTitle && isTextNode(title) ? titleId : undefined}
          {...slotProps?.title}
          sx={mergeSx(
            {
              px: { xs: 2.25, sm: 3 },
              pt: { xs: 2, sm: 2.5 },
              pb: hasDescription ? 1 : 1.5,
            },
            titleSx,
            slotProps?.title?.sx,
          )}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            gap={1.5}
            {...slotProps?.header}
            sx={mergeSx(
              {
                minWidth: 0,
              },
              slotProps?.header?.sx,
            )}
          >
            <Stack
              spacing={0.5}
              flexGrow={1}
              minWidth={0}
              overflow="hidden"
              {...slotProps?.headerText}
              sx={mergeSx(
                {
                  pr: showCloseButton ? 1 : 0,
                },
                slotProps?.headerText?.sx,
              )}
            >
              {hasTitle ? (
                isTextNode(title) ? (
                  <Typography
                    variant="h6"
                    component="span"
                    noWrap
                    {...slotProps?.titleText}
                    sx={mergeSx(
                      {
                        display: 'block',
                        color: 'text.primary',
                        fontWeight: 700,
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                      slotProps?.titleText?.sx,
                    )}
                  >
                    {title}
                  </Typography>
                ) : (
                  <Box
                    id={titleId}
                    {...slotProps?.customTitle}
                    sx={mergeSx(
                      {
                        minWidth: 0,
                      },
                      slotProps?.customTitle?.sx,
                    )}
                  >
                    {title}
                  </Box>
                )
              ) : null}

              {hasDescription ? (
                isTextNode(description) ? (
                  <Typography
                    id={descriptionId}
                    variant="body2"
                    color="text.secondary"
                    {...slotProps?.description}
                    sx={mergeSx(
                      {
                        display: 'block',
                        lineHeight: 1.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                      slotProps?.description?.sx,
                    )}
                  >
                    {description}
                  </Typography>
                ) : (
                  <Box
                    id={descriptionId}
                    {...slotProps?.customDescription}
                    sx={mergeSx(
                      {
                        minWidth: 0,
                        color: 'text.secondary',
                      },
                      slotProps?.customDescription?.sx,
                    )}
                  >
                    {description}
                  </Box>
                )
              ) : null}
            </Stack>

            {showCloseButton ? (
              <IconButton
                aria-label={closeButtonLabel}
                onClick={handleCloseButtonClick}
                edge="end"
                {...slotProps?.closeButton}
                sx={mergeSx(
                  {
                    mt: -0.25,
                    mr: -0.75,
                    flexShrink: 0,
                    color: 'text.secondary',

                    '&:hover': {
                      color: 'text.primary',
                      bgcolor: 'action.hover',
                    },

                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  },
                  slotProps?.closeButton?.sx,
                )}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            ) : null}
          </Stack>
        </DialogTitle>
      ) : null}

      <DialogContent
        dividers={dividers}
        {...slotProps?.content}
        sx={mergeSx(
          {
            px: { xs: 2.25, sm: 3 },
            py: { xs: 2, sm: 2.25 },
            typography: 'body1',
          },
          contentSx,
          slotProps?.content?.sx,
        )}
      >
        {children}
      </DialogContent>

      {hasActions ? (
        <DialogActions
          {...slotProps?.actions}
          sx={mergeSx(
            {
              px: { xs: 2.25, sm: 3 },
              py: { xs: 1.75, sm: 2 },
              gap: 1,
              flexWrap: 'wrap',
              backgroundColor: dividers ? 'background.default' : 'transparent',
            },
            getActionsJustifyContent(actionsAlign),
            actionsSx,
            slotProps?.actions?.sx,
          )}
        >
          {actions}
        </DialogActions>
      ) : null}
    </Dialog>
  );
}

export default PrimitiveModal;