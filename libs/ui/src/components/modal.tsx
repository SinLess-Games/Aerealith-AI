'use client';

import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { DialogProps } from '@mui/material/Dialog';
import type { SxProps, Theme } from '@mui/material/styles';
import { type ReactNode, useId } from 'react';

export type PrimitiveModalProps = {
  /** Whether the modal is open. */
  open: boolean;

  /** Called when modal closes from backdrop, escape, or close button. */
  onClose: () => void;

  /** Optional Dialog onClose passthrough. */
  onDialogClose?: DialogProps['onClose'];

  /** Optional modal title. */
  title?: ReactNode;

  /** Optional short description below title. */
  description?: ReactNode;

  /** Optional footer actions. */
  actions?: ReactNode;

  /** Main modal content. */
  children: ReactNode;

  /** Show or hide the close button. */
  showCloseButton?: boolean;

  /** Adds dividers between title/content/actions. */
  dividers?: boolean;

  /** Optional style overrides for the Dialog paper. */
  paperSx?: SxProps<Theme>;
} & Omit<DialogProps, 'open' | 'onClose' | 'children'>;

function mergeSx(...values: Array<SxProps<Theme> | undefined>): SxProps<Theme> {
  const merged = values.flatMap((value) => {
    if (!value) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  });

  return merged as SxProps<Theme>;
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
  dividers = false,
  maxWidth = 'sm',
  fullWidth = true,
  scroll = 'paper',
  paperSx,
  PaperProps,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ...dialogProps
}: PrimitiveModalProps) {
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();

  const hasHeader = Boolean(title || description || showCloseButton);
  const titleId = ariaLabelledBy ?? (title ? generatedTitleId : undefined);
  const descriptionId =
    ariaDescribedBy ?? (description ? generatedDescriptionId : undefined);

  const handleDialogClose: DialogProps['onClose'] = (event, reason) => {
    onDialogClose?.(event, reason);
    onClose();
  };

  const handleCloseButtonClick = (): void => {
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      scroll={scroll}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      PaperProps={{
        ...PaperProps,
        sx: mergeSx(
          {
            borderRadius: 3,
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
        <DialogTitle id={titleId} sx={{ pb: description ? 0.5 : 1 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            gap={1}
          >
            <Stack spacing={0.5} flexGrow={1} overflow="hidden">
              {typeof title === 'string' ? (
                <Typography
                  variant="h6"
                  component="span"
                  noWrap
                  sx={{
                    display: 'block',
                    fontWeight: 600,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    color: 'text.primary',
                  }}
                >
                  {title}
                </Typography>
              ) : (
                title
              )}

              {description ? (
                typeof description === 'string' ? (
                  <Typography
                    id={descriptionId}
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      lineHeight: 1.4,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {description}
                  </Typography>
                ) : (
                  <span id={descriptionId}>{description}</span>
                )
              ) : null}
            </Stack>

            {showCloseButton ? (
              <IconButton
                aria-label="Close modal"
                onClick={handleCloseButtonClick}
                edge="end"
                sx={{
                  ml: 1,
                  mt: 0.25,
                  color: 'text.secondary',
                  '&:hover': {
                    color: 'text.primary',
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            ) : null}
          </Stack>
        </DialogTitle>
      ) : null}

      <DialogContent
        dividers={dividers}
        sx={{
          px: 3,
          py: 2,
          typography: 'body1',
        }}
      >
        {children}
      </DialogContent>

      {actions ? (
        <DialogActions
          sx={{
            px: 3,
            py: 2,
            backgroundColor: dividers ? 'background.default' : 'transparent',
          }}
        >
          {actions}
        </DialogActions>
      ) : null}
    </Dialog>
  );
}

export default PrimitiveModal;