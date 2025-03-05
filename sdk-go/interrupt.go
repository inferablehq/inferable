package inferable

type VALID_INTERRUPT_TYPES string

const (
	APPROVAL VALID_INTERRUPT_TYPES = "approval"
	GENERAL  VALID_INTERRUPT_TYPES = "general"
)

type Interrupt struct {
	Type    VALID_INTERRUPT_TYPES `json:"type"`
	Message string                `json:"message,omitempty"`
}

// Error implements the error interface
func (i *Interrupt) Error() string {
	if i.Message != "" {
		return i.Message
	}
	return string(i.Type) + " interrupt"
}

func NewInterrupt(typ VALID_INTERRUPT_TYPES, message string) *Interrupt {
	return &Interrupt{
		Type:    typ,
		Message: message,
	}
}

func ApprovalInterrupt(message string) *Interrupt {
	return NewInterrupt(APPROVAL, message)
}

func GeneralInterrupt(message string) *Interrupt {
	return NewInterrupt(GENERAL, message)
}
