package inferable

type VALID_INTERRUPT_TYPES string

const (
	APPROVAL VALID_INTERRUPT_TYPES = "approval"
)

type Interrupt struct {
	Type VALID_INTERRUPT_TYPES `json:"type"`
}

func NewInterrupt(typ VALID_INTERRUPT_TYPES) *Interrupt {
	return &Interrupt{
		Type: typ,
	}
}

func ApprovalInterrupt() *Interrupt {
	return NewInterrupt(APPROVAL)
}
